import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'tabstash-package-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'scripts'));
  mkdirSync(path.join(root, 'extension'));
  copyFileSync(fileURLToPath(new URL('../scripts/package.py', import.meta.url)), path.join(root, 'scripts/package.py'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.1.0' }));
  writeFileSync(path.join(root, 'extension/manifest.json'), JSON.stringify({ version: '0.1.0', manifest_version: 3, description: 'Test fixture' }));
  writeFileSync(path.join(root, 'extension/background.js'), '// packaged fixture\n');
  writeFileSync(path.join(root, 'README.md'), 'Not part of the extension');
  writeFileSync(path.join(root, '.gitignore'), 'dist/\n.DS_Store\n');
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-q'); git('add', '.');
  const commit = () => git('-c', 'user.name=Package test', '-c', 'user.email=package@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Fixture');
  commit();
  const run = () => spawnSync('python3', ['scripts/package.py'], { cwd: root, encoding: 'utf8' });
  return { root, git, commit, run };
}

test('release ZIP is reproducible, has a root manifest, and excludes repository and ignored files', t => {
  const { root, run } = fixture(t);
  writeFileSync(path.join(root, 'extension/.DS_Store'), 'ignored metadata');
  assert.equal(run().status, 0);
  const zip = readFileSync(path.join(root, 'dist/tabstash-0.1.0.zip'));
  const inventory = JSON.parse(readFileSync(path.join(root, 'dist/tabstash-0.1.0.json')));
  assert.deepEqual(inventory.files.map(file => file.path), ['background.js', 'manifest.json']);
  assert.equal(inventory.bytes, zip.length);
  assert.equal(inventory.sha256, createHash('sha256').update(zip).digest('hex'));
  assert.equal(readFileSync(path.join(root, 'dist/tabstash-0.1.0.zip.sha256'), 'utf8'), `${inventory.sha256}  tabstash-0.1.0.zip\n`);
  execFileSync('python3', ['-c', 'import zipfile; z=zipfile.ZipFile("dist/tabstash-0.1.0.zip"); assert z.namelist()==["background.js", "manifest.json"]; assert z.read("background.js")==b"// packaged fixture\\n"'], { cwd: root });
  assert.equal(run().status, 0);
  assert.deepEqual(readFileSync(path.join(root, 'dist/tabstash-0.1.0.zip')), zip);
});

test('release packaging rejects modified and untracked extension content', t => {
  const { root, run, git } = fixture(t);
  writeFileSync(path.join(root, 'extension/background.js'), '// uncommitted');
  assert.match(run().stderr, /Commit or remove changes/);
  git('restore', 'extension/background.js');
  writeFileSync(path.join(root, 'extension/accidental.txt'), 'untracked');
  assert.match(run().stderr, /Commit or remove changes/);
});

test('release packaging rejects tracked symlinks and version mismatch', t => {
  const { root, run, git, commit } = fixture(t);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.2.0' }));
  assert.match(run().stderr, /matching numeric versions/);
  git('restore', 'package.json');
  symlinkSync('../README.md', path.join(root, 'extension/linked.txt'));
  git('add', 'extension/linked.txt'); commit();
  assert.match(run().stderr, /Only regular extension files/);
});
