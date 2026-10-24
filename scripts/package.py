#!/usr/bin/env python3
"""Build a reproducible Chrome Web Store ZIP from committed extension files."""
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def main():
    if git('status', '--porcelain', '--untracked-files=all', '--', 'extension'):
        raise ValueError('Commit or remove changes under extension/ before packaging.')
    commit = git('rev-parse', 'HEAD').decode().strip()
    entries = git('ls-tree', '-rz', 'HEAD', '--', 'extension').split(b'\0')
    files = {}
    for entry in filter(None, entries):
        metadata, raw_path = entry.split(b'\t', 1)
        mode, kind, object_id = metadata.split()
        name = raw_path.decode().removeprefix('extension/')
        if mode not in (b'100644', b'100755') or kind != b'blob':
            raise ValueError(f'Only regular extension files may be packaged: {name}')
        if any(part.startswith('.') for part in Path(name).parts):
            raise ValueError(f'Unexpected hidden extension file: {name}')
        files[name] = git('cat-file', 'blob', object_id.decode())
    manifest = json.loads(files['manifest.json'])
    package = json.loads((ROOT / 'package.json').read_text())
    version = manifest['version']
    if not re.fullmatch(r'\d+(?:\.\d+){0,3}', version) or package['version'] != version:
        raise ValueError('Manifest and package.json must have matching numeric versions.')
    if manifest['manifest_version'] != 3 or not 1 <= len(manifest['description']) <= 132:
        raise ValueError('Expected Manifest V3 and a description of 1–132 characters.')

    # Fixed order, timestamps, modes, and compression make identical input reproducible.
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    archive_bytes = buffer.getvalue()
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(files)
        assert 'manifest.json' in archive.namelist()
        for name, data in files.items():
            assert archive.read(name) == data

    filename = f'tabstash-{version}.zip'
    digest = hashlib.sha256(archive_bytes).hexdigest()
    inventory = {
        'version': version, 'sourceCommit': commit, 'archive': filename,
        'sha256': digest, 'bytes': len(archive_bytes),
        'files': [{'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                  for name, data in sorted(files.items())]
    }
    output = ROOT / 'dist'
    output.mkdir(exist_ok=True)
    (output / filename).write_bytes(archive_bytes)
    (output / f'{filename}.sha256').write_text(f'{digest}  {filename}\n')
    (output / f'tabstash-{version}.json').write_text(json.dumps(inventory, indent=2) + '\n')
    print(f'Created dist/{filename}: {len(files)} files, {len(archive_bytes):,} bytes')
    print(f'SHA-256: {digest}')
    print('Local release candidate only; nothing uploaded or submitted.')


if __name__ == '__main__':
    main()
