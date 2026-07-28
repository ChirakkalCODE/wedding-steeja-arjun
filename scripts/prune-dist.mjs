/**
 * Deletes files in `dist/_astro/` that nothing in the build refers to.
 *
 * Astro emits every imported image into the build and then removes the ones
 * that were only used as a transform source — unless something read a property
 * off the imported object, because an imported image is a Proxy and any
 * property access registers it as "referenced"
 * (node_modules/astro/dist/assets/utils/proxy.js). `<Image>` and `<Picture>`
 * both read `width`/`height` to size their fallback `<img>`, so using them
 * leaves the full-size master sitting in the deploy, downloaded by nobody.
 *
 * Rather than avoiding the components, the build sweeps up afterwards: collect
 * every `_astro/...` filename mentioned in the built HTML/CSS/JS, drop whatever
 * is left over. Runs automatically as npm's `postbuild`.
 */
import { readdir, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const assets = join(dist, '_astro');

/** Files whose text can name an asset. */
const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.svg']);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

try {
  await stat(assets);
} catch {
  console.log('prune: no dist/_astro, nothing to do');
  process.exit(0);
}

const all = await walk(dist);
const referenced = new Set();

for (const file of all) {
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
  if (!TEXT.has(ext)) continue;
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/_astro\/([A-Za-z0-9._-]+)/g)) {
    referenced.add(match[1]);
  }
}

let removed = 0;
let bytes = 0;
for (const file of await readdir(assets)) {
  if (referenced.has(file)) continue;
  const full = join(assets, file);
  bytes += (await stat(full)).size;
  await unlink(full);
  removed += 1;
  console.log(`  pruned  ${file}`);
}

console.log(
  removed
    ? `prune: removed ${removed} unreferenced asset(s), ${(bytes / 1024).toFixed(0)} kB`
    : 'prune: nothing unreferenced',
);
