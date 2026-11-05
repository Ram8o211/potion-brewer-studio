// Production build: bundles the ES modules into one script, fingerprints
// the script and stylesheet, copies the static assets, writes a service
// worker with a versioned precache list and packages everything as a ZIP.
// No third-party tools — plain Node.js.
//
//   node scripts/build.mjs            → dist/ and release/*.zip
//   node scripts/build.mjs --no-zip   → dist/ only

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { makeZip } from './lib/zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const RELEASE = path.join(ROOT, 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const args = new Set(process.argv.slice(2));

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);

// ------------------------------------------------------------------ bundle
const IMPORT_RE = /^import\s+(\{[\s\S]*?\}|\*\s+as\s+[A-Za-z_$][\w$]*)\s+from\s+'([^']+)';?[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+(async\s+function\*?|function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\};?[ \t]*$/gm;

/** @typedef {{file: string, id: number, src: string, deps: string[], exports: Map<string,string>, imports: {from: string, names: [string,string][] | null, ns: string | null}[]}} Mod */

/** @type {Map<string, Mod>} */
const modules = new Map();
/** @type {Mod[]} */
const order = [];

function load(file, stack = []) {
  if (modules.has(file)) {
    if (stack.includes(file)) throw new Error('Import cycle: ' + [...stack, file].map(rel).join(' -> '));
    return modules.get(file);
  }
  const src = fs.readFileSync(file, 'utf8');
  /** @type {Mod} */
  const mod = { file, id: modules.size, src, deps: [], exports: new Map(), imports: [] };
  modules.set(file, mod);
  for (const m of src.matchAll(IMPORT_RE)) {
    const from = path.resolve(path.dirname(file), m[2]);
    mod.deps.push(from);
    const spec = m[1].trim();
    if (spec.startsWith('*')) mod.imports.push({ from, names: null, ns: spec.split(/\s+/).pop() || '' });
    else {
      const names = spec.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
        const [a, b] = s.split(/\s+as\s+/);
        return /** @type {[string,string]} */ ([a.trim(), (b || a).trim()]);
      });
      mod.imports.push({ from, names, ns: null });
    }
  }
  for (const m of src.matchAll(EXPORT_DECL_RE)) mod.exports.set(m[2], m[2]);
  for (const m of src.matchAll(EXPORT_LIST_RE)) {
    for (const part of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      const [local, alias] = part.split(/\s+as\s+/);
      mod.exports.set((alias || local).trim(), local.trim());
    }
  }
  for (const d of mod.deps) load(d, [...stack, file]);
  order.push(mod);
  return mod;
}

/** Drop whole-line comments and indentation (never touches code on a line). */
function compact(src) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('//')) continue;
    if (t.startsWith('/*')) {
      let j = i;
      while (j < lines.length && !lines[j].includes('*/')) j++;
      if (j < lines.length && lines[j].trim().endsWith('*/')) { i = j; continue; }
    }
    out.push(t);
  }
  return out.join('\n');
}

function bundle(entry) {
  load(entry);
  // every imported name must be exported by its module
  for (const m of order) {
    for (const imp of m.imports) {
      const dep = modules.get(imp.from);
      if (!dep) throw new Error(`${rel(m.file)}: cannot resolve ${rel(imp.from)}`);
      for (const [name] of imp.names || []) {
        if (!dep.exports.has(name)) throw new Error(`${rel(m.file)} imports '${name}' which ${rel(dep.file)} does not export`);
      }
    }
  }
  const parts = [`// The Alchemist's Shop ${pkg.version} — bundled build`];
  for (const m of order) {
    let body = m.src.replace(IMPORT_RE, (all, spec, from) => {
      const dep = modules.get(path.resolve(path.dirname(m.file), from));
      if (!dep) throw new Error('unresolved ' + from);
      const s = spec.trim();
      if (s.startsWith('*')) return `const ${s.split(/\s+/).pop()} = __m${dep.id};`;
      const names = s.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
        const [a, b] = x.split(/\s+as\s+/);
        return b ? `${a.trim()}: ${b.trim()}` : a.trim();
      });
      return `const { ${names.join(', ')} } = __m${dep.id};`;
    });
    body = body.replace(EXPORT_LIST_RE, '');
    body = body.replace(/^export\s+(?=(async\s+function|function|class|const|let|var)\b)/gm, '');
    if (/^\s*(import|export)\s/m.test(body)) throw new Error(`${rel(m.file)}: unsupported import/export form left after bundling`);
    const exp = [...m.exports].map(([alias, local]) => (alias === local ? alias : `${alias}: ${local}`));
    parts.push(`// ${rel(m.file)}\nconst __m${m.id} = (() => {\n${compact(body)}\nreturn { ${exp.join(', ')} };\n})();`);
  }
  return parts.join('\n');
}

// ------------------------------------------------------------------ build
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function listFiles(dir, base = dir) {
  /** @type {string[]} */
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

const t0 = performance.now();
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const js = bundle(path.join(ROOT, 'src', 'main.js'));
const jsName = `app.${hash(js)}.js`;
fs.writeFileSync(path.join(DIST, jsName), js);

// The editor's pure environment worker uses the same bundler and ships offline.
modules.clear(); order.length = 0;
const studioWorker = bundle(path.join(ROOT, 'src', 'studio', 'worker.js'));
fs.writeFileSync(path.join(DIST, 'studio-worker.js'), studioWorker);
// Restore the application graph for the module count/report below.
modules.clear(); order.length = 0; load(path.join(ROOT, 'src', 'main.js'));


const css = fs.readFileSync(path.join(ROOT, 'styles', 'main.css'), 'utf8');
const cssName = `styles/main.${hash(css)}.css`;
fs.mkdirSync(path.join(DIST, 'styles'), { recursive: true });
fs.writeFileSync(path.join(DIST, cssName), css);

copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
fs.copyFileSync(path.join(ROOT, 'manifest.webmanifest'), path.join(DIST, 'manifest.webmanifest'));

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
if (!html.includes('src="src/main.js"') || !html.includes('href="styles/main.css"')) throw new Error('index.html entry points changed — update the build script');
html = html.replace('src="src/main.js"', `src="${jsName}"`).replace('href="styles/main.css"', `href="${cssName}"`);
fs.writeFileSync(path.join(DIST, 'index.html'), html);

let sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
// Asset-only atlas/metadata edits also need a fresh offline cache. Fingerprint
// every shipped file before adding the worker and build-info (no circular hash).
const content = listFiles(DIST).sort().map((file) => `${file}:${hash(fs.readFileSync(path.join(DIST, file)))}`).join('\n');
const version = `${pkg.version}-${hash(content + sw)}`;
const precache = ['./', ...listFiles(DIST)];
if (!sw.includes("const VERSION = 'dev';") || !sw.includes('const ASSETS = [];')) throw new Error('sw.js placeholders missing');
sw = sw.replace("const VERSION = 'dev';", `const VERSION = '${version}';`).replace('const ASSETS = [];', `const ASSETS = ${JSON.stringify(precache)};`);
fs.writeFileSync(path.join(DIST, 'sw.js'), sw);
fs.writeFileSync(path.join(DIST, 'build-info.json'), JSON.stringify({ name: pkg.name, version: pkg.version, build: version, modules: order.length, files: listFiles(DIST).length + 1 }, null, 2) + '\n');

// ------------------------------------------------------------------ report
const files = listFiles(DIST);
let total = 0, totalGz = 0;
const rows = files.map((f) => {
  const buf = fs.readFileSync(path.join(DIST, f));
  const gz = zlib.gzipSync(buf, { level: 9 }).length;
  total += buf.length; totalGz += gz;
  return `  ${f.padEnd(34)} ${(buf.length / 1024).toFixed(1).padStart(8)} KB  ${(gz / 1024).toFixed(1).padStart(7)} KB gz`;
});
console.log(`Built ${version} from ${order.length} modules in ${(performance.now() - t0).toFixed(0)} ms`);
console.log(rows.join('\n'));
console.log(`  ${'total'.padEnd(34)} ${(total / 1024).toFixed(1).padStart(8)} KB  ${(totalGz / 1024).toFixed(1).padStart(7)} KB gz`);

if (!args.has('--no-zip')) {
  fs.mkdirSync(RELEASE, { recursive: true });
  const zipName = `alchemists-shop-${pkg.version}-web.zip`;
  const entries = files.map((f) => ({ name: `alchemists-shop/${f}`, data: fs.readFileSync(path.join(DIST, f)) }));
  const zip = makeZip(entries);
  fs.writeFileSync(path.join(RELEASE, zipName), zip);
  console.log(`Packaged release/${zipName} (${(zip.length / 1024).toFixed(1)} KB)`);
}
