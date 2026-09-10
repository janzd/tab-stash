import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Manifest V3 required');
for (const file of [manifest.background.service_worker, ...Object.values(manifest.icons), 'library.html', 'library.js', 'styles.css']) {
  if (!existsSync(path.join(root, 'extension', file))) throw new Error(`Missing extension asset: ${file}`);
}
for (const file of readdirSync(path.join(root, 'extension')).filter(file => file.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', path.join(root, 'extension', file)]);
}
console.log('Manifest, packaged assets, and JavaScript syntax verified.');
