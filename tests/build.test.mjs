import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('identical production builds are stable and an atlas-only edit invalidates the offline cache', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'potion-asset-build-'));
  try {
    for (const item of ['src', 'scripts', 'styles', 'assets', 'package.json', 'index.html', 'manifest.webmanifest', 'sw.js'])
      fs.cpSync(path.join(root, item), path.join(tmp, item), { recursive: true });
    const build = () => {
      execFileSync(process.execPath, [path.join(tmp, 'scripts/build.mjs'), '--no-zip'], { cwd: tmp, stdio: 'pipe', timeout: 30000 });
      return JSON.parse(fs.readFileSync(path.join(tmp, 'dist/build-info.json'), 'utf8')).build;
    };
    const before = build();
    assert.equal(build(), before, 'unchanged inputs produce the same cache version');
    const atlas = path.join(tmp, 'assets/ingredients/biomes/forest.json');
    const metadata = JSON.parse(fs.readFileSync(atlas, 'utf8')); metadata.authoringRevision = 2;
    fs.writeFileSync(atlas, JSON.stringify(metadata));
    const after = build();
    assert.notEqual(after, before, 'metadata-only publication gets a new offline cache');
    assert.ok(fs.readFileSync(path.join(tmp, 'dist/sw.js'), 'utf8').includes(`const VERSION = '${after}';`));
    assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'dist/assets/ingredients/biomes/forest.json'), 'utf8')).authoringRevision, 2);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
