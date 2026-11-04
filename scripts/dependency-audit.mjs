import fs from 'node:fs';
import path from 'node:path';
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);
const graph = Object.fromEntries(files('src').sort().map((file) => [file, [...fs.readFileSync(file, 'utf8').matchAll(/^import[\s\S]*?from\s+'([^']+)'/gm)].map((m) => path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])))]));
const layers = {};
for (const [file, deps] of Object.entries(graph)) {
  const from = file.split('/')[1];
  for (const d of deps) {
    const to = d.split('/')[1];
    if (from !== to) { layers[from] ||= {}; layers[from][to] = (layers[from][to] || 0) + 1; }
  }
}
const cycles = [], visited = new Set();
function visit(file, stack = []) {
  if (stack.includes(file)) { cycles.push([...stack.slice(stack.indexOf(file)), file]); return; }
  if (visited.has(file)) return;
  visited.add(file);
  for (const d of graph[file] || []) visit(d, [...stack, file]);
}
for (const file of Object.keys(graph)) visit(file);
fs.writeFileSync('docs/dependencies.json', JSON.stringify({ modules: Object.keys(graph).length, edges: Object.values(graph).reduce((n, ds) => n + ds.length, 0), cycles, layers, graph }, null, 2) + '\n');
console.log(`${Object.keys(graph).length} modules; ${cycles.length} static import cycles. Written docs/dependencies.json`);
