"""Prepare Hosting metadata and immutable download files from verified signed outputs."""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]


def prepare(artifacts: pathlib.Path, apksigner: pathlib.Path):
    gradle = (ROOT / 'android-native/app/build.gradle.kts').read_text()
    version = re.search(r'versionName\s*=\s*"([0-9.]+)"', gradle).group(1)
    code = int(re.search(r'versionCode\s*=\s*(\d+)', gradle).group(1))
    pin = json.loads((ROOT / 'android-native/ci/release-signing-public.json').read_text())
    apk = artifacts / f'GaGa-{version}-release.apk'
    aab = artifacts / f'GaGa-{version}-release.aab'
    report = subprocess.check_output(['java', '-jar', str(apksigner), 'verify', '--verbose', '--print-certs', str(apk)], text=True)
    assert re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-f]+)', report).group(1) == pin['sha256']
    bundle = subprocess.check_output(['java', '-m', 'jdk.jartool/sun.security.tools.jarsigner.Main', '-verify', str(aab)], text=True)
    assert 'jar verified.' in bundle
    cert = subprocess.check_output(['keytool', '-printcert', '-jarfile', str(aab)], text=True)
    assert re.search(r'SHA256: ([0-9A-F:]+)', cert).group(1).replace(':', '').lower() == pin['sha256']
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (apk, aab)}
    directory = ROOT / 'hosting/public/downloads/releases' / version
    directory.mkdir(parents=True, exist_ok=True)
    # Spark Hosting disallows APK executables. Binaries live in the existing
    # public Supabase release bucket; Hosting serves the site and metadata.
    sums = ''.join(f'{digest}  {name}\n' for name, digest in hashes.items())
    (directory / 'SHA256SUMS.txt').write_text(sums)
    (directory / 'signature-verification.txt').write_text(report)
    public_base = f'https://github.com/omarouma/app/releases/download/android-{version}/'
    manifest = json.loads((ROOT / 'hosting/public/app-updates/android.json').read_text())
    assert code >= manifest['latestVersionCode'], 'Refusing version rollback'
    manifest.update(latestVersionName=version, latestVersionCode=code,
                    publishedAt=datetime.now(timezone.utc).isoformat(),
                    releaseNotes=f'GaGa {version}: private view-once photos, cross-chat file search, reviewed official and service directories, media actions, offline text recognition and photo editing. Signed with the existing release certificate. Update installation requires your confirmation.')
    manifest['channels']['apk'] = dict(versionCode=code, url=public_base + apk.name,
                                       sha256=hashes[apk.name], sizeBytes=apk.stat().st_size)
    (ROOT / 'hosting/public/app-updates/android.json').write_text(json.dumps(manifest, indent=2) + '\n')
    firebase = json.loads((ROOT / 'firebase.json').read_text())
    targets = {'/downloads/gaga-latest.apk': apk.name, '/downloads/gaga-latest.aab': aab.name,
               '/downloads/SHA256SUMS.txt': 'SHA256SUMS.txt', '/downloads/gaga-latest-consolidated.apk': apk.name}
    for redirect in firebase['hosting']['redirects']:
        if redirect['source'] in targets:
            redirect['destination'] = public_base + targets[redirect['source']]
    (ROOT / 'firebase.json').write_text(json.dumps(firebase, indent=2) + '\n')
    local = dict(firebase['hosting'], public='public')
    (ROOT / 'hosting/firebase.json').write_text(json.dumps({'hosting': local}, indent=2) + '\n')
    for name in ['index.html', 'download.html']:
        path = ROOT / 'hosting/public' / name
        text = path.read_text()
        text = re.sub(r'Version \d+\.\d+\.\d+(?: \(build \d+\))?', f'Version {version} (build {code})', text)
        text = re.sub(r'"softwareVersion":"[0-9.]+"', f'"softwareVersion":"{version}"', text)
        text = text.replace('~46 MB', f'{apk.stat().st_size / 1000000:.1f} MB')
        text = text.replace('Want the newest features (GaGa Today shop + hardened wallet)?', 'Includes the latest chat, Today, QR and notification improvements.')
        text = text.replace('Download the all-features build', 'Download the same verified release')
        path.write_text(text)
    print(f'Prepared GaGa {version} ({code}); both signatures match pinned certificate')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--artifacts', required=True, type=pathlib.Path)
    parser.add_argument('--apksigner', required=True, type=pathlib.Path)
    args = parser.parse_args()
    prepare(args.artifacts, args.apksigner)
