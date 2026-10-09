// Zips dist/ for the Chrome Web Store: manifest.json at the top level of the archive.
// Usage: npm run package   (builds first) -> releases/ai-distraction-blocker-<version>.zip
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import JSZip from 'jszip';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));

const missingIcons = Object.values(manifest.icons ?? {}).filter((p) => {
  try {
    return !statSync(join(dist, p)).isFile();
  } catch {
    return true;
  }
});
if (!manifest.icons || missingIcons.length) {
  console.error(`Icons missing from dist/: ${missingIcons.join(', ') || 'no "icons" in manifest'} — run npm run store-assets`);
  process.exit(1);
}

const zip = new JSZip();
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else zip.file(relative(dist, full).split(sep).join('/'), readFileSync(full));
  }
};
walk(dist);

mkdirSync(join(root, 'releases'), { recursive: true });
const out = join(root, 'releases', `ai-distraction-blocker-${manifest.version}.zip`);
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`${relative(root, out)} — ${Object.keys(zip.files).length} files, version ${manifest.version}`);
