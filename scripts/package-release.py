#!/usr/bin/env python3
"""Package the verified source and portable hosting output; exclude private files."""
import argparse
import pathlib
import subprocess
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('output', help='ZIP path outside the source directory')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent.parent
output = pathlib.Path(args.output).resolve()
if output.is_relative_to(root):
    parser.error('Save the ZIP outside the source directory.')
# Frontend production configuration may contain public VITE values only.
for line in (root / '.env.production').read_text().splitlines():
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    if not line.split('=', 1)[0].startswith('VITE_'):
        raise RuntimeError('Production config contains a non-public setting; exclude it first.')
    if 'SERVICE_ROLE' in line or 'sb_secret_' in line or 'TURN_SHARED_SECRET' in line:
        raise RuntimeError('Private setting found in frontend production config.')
subprocess.run(['node', 'scripts/verify-build-output.mjs'], cwd=root, check=True)
output.parent.mkdir(parents=True, exist_ok=True)
excluded = {'node_modules', '.git', '.firebase', '.codex', '__pycache__'}
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for file in sorted(root.rglob('*')):
        if not file.is_file():
            continue
        relative = file.relative_to(root)
        if any(part in excluded for part in relative.parts):
            continue
        if file.name.startswith('.env') and file.name not in {'.env.example', '.env.production'}:
            continue
        if file.name == 'stats.html' or file.suffix == '.map' or file.name.endswith('.tsbuildinfo') or 'debug.log' in file.name:
            continue
        archive.write(file, pathlib.Path('app-main') / relative)
with zipfile.ZipFile(output) as archive:
    if archive.testzip() is not None:
        raise RuntimeError('ZIP integrity validation failed.')
    assert 'app-main/dist/index.html' in archive.namelist()
    assert 'app-main/RELEASE-MANIFEST.json' in archive.namelist()
print(f'Verified release archive: {output.stat().st_size / 1024 / 1024:.1f} MiB')
