"""Stage or publish Firebase Hosting only after verifying the public signed-APK hash."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import urllib.parse
import urllib.request
from google_release_identity import google_token, NoRedirect

ROOT = Path(__file__).resolve().parents[1]
API = 'https://firebasehosting.googleapis.com/v1beta1/'


def deploy(publish=False, receipt=None):
    config = json.loads((ROOT / 'firebase.json').read_text())['hosting']
    assert config['site'] == 'oumagachat'
    public = ROOT / config['public']
    manifest = json.loads((public / 'app-updates/android.json').read_text())
    channel = manifest['channels']['apk']
    apk_url = channel['url']
    parsed = urllib.parse.urlparse(apk_url)
    version_name = manifest['latestVersionName']
    assert parsed.scheme == 'https' and parsed.hostname == 'github.com'
    assert parsed.path == f'/omarouma/app/releases/download/android-{version_name}/GaGa-{version_name}-release.apk'
    # Public files are fetched separately, with no Google token or shared headers.
    with urllib.request.urlopen(apk_url, timeout=120) as response:
        digest, size = hashlib.sha256(), 0
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    assert size == channel['sizeBytes'] and digest.hexdigest() == channel['sha256']
    # A partial mirror phase must never expose a broken public App Bundle link.
    bundle = manifest['artifacts']['aab']
    assert bundle['url'] == f'https://github.com/omarouma/app/releases/download/android-{version_name}/GaGa-{version_name}-release.aab'
    with urllib.request.urlopen(bundle['url'], timeout=120) as response:
        digest, size = hashlib.sha256(), 0
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    assert size == bundle['sizeBytes'] and digest.hexdigest() == bundle['sha256']
    with urllib.request.urlopen('https://gagachat.app/app-updates/android.json', timeout=20) as response:
        live_manifest = json.load(response)
    assert manifest['latestVersionCode'] >= live_manifest['latestVersionCode'], 'Refusing public version rollback'
    credential = Path(os.environ['GOOGLE_APPLICATION_CREDENTIALS'])
    token = google_token(credential, scope='https://www.googleapis.com/auth/firebase.hosting')
    opener = urllib.request.build_opener(NoRedirect)

    def api(method, url, *, value=None, payload=None, headers=None):
        parsed = urllib.parse.urlparse(url)
        assert parsed.scheme == 'https' and parsed.hostname in {
            'firebasehosting.googleapis.com', 'upload-firebasehosting.googleapis.com'}
        request_headers = {'Authorization': 'Bearer ' + token, **(headers or {})}
        if value is not None:
            payload = json.dumps(value).encode()
            request_headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(url, data=payload, headers=request_headers, method=method)
        with opener.open(request, timeout=120) as response:
            body = response.read()
            return json.loads(body) if body and 'json' in response.headers.get('Content-Type', '') else {}

    previous = api('GET', API + 'sites/oumagachat/releases?pageSize=1')['releases'][0]
    hosting = {
        'cleanUrls': config.get('cleanUrls', False),
        'headers': [{'glob': item['source'], 'headers': {h['key']: h['value'] for h in item['headers']}} for item in config.get('headers', [])],
        'redirects': [{'glob': item['source'], 'location': item['destination'], 'statusCode': item['type']} for item in config.get('redirects', [])],
        'rewrites': [{'glob': item['source'], 'path': item['destination']} for item in config.get('rewrites', [])],
    }
    files, compressed = {}, {}
    for path in sorted(public.rglob('*')):
        if not path.is_file():
            continue
        assert not path.is_symlink()
        assert path.suffix.lower() not in {'.apk', '.aab', '.exe'}, 'Binaries must be in the release bucket'
        payload = gzip.compress(path.read_bytes(), mtime=0)
        digest = hashlib.sha256(payload).hexdigest()
        files['/' + path.relative_to(public).as_posix()] = digest
        compressed[digest] = payload
    version = api('POST', API + 'sites/oumagachat/versions', value={'config': hosting})
    result = api('POST', API + version['name'] + ':populateFiles', value={'files': files})
    required = result.get('uploadRequiredHashes', [])
    for digest in required:
        api('POST', result['uploadUrl'] + '/' + digest, payload=compressed[digest], headers={'Content-Type': 'application/octet-stream'})
    finalized = api('PATCH', API + version['name'] + '?update_mask=status', value={'status': 'FINALIZED'})
    assert finalized['status'] == 'FINALIZED'
    record = {'version': version['name'], 'previousVersion': previous['version']['name'],
              'appVersion': version_name, 'fileCount': len(files), 'published': False}
    if publish:
        current = api('GET', API + 'sites/oumagachat/releases?pageSize=1')['releases'][0]
        assert current['version']['name'] == record['previousVersion'], 'Another Hosting release intervened'
        query = urllib.parse.urlencode({'versionName': version['name']})
        released = api('POST', API + 'sites/oumagachat/releases?' + query, value={'message': 'Verified signed GaGa ' + version_name})
        record.update(published=True, release=released['name'], releaseTime=released.get('releaseTime'))
    if receipt:
        receipt.write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--receipt', type=Path)
    options = parser.parse_args()
    deploy(options.publish, options.receipt)
