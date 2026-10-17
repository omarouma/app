"""Deploy only Hosting assets; credentials stay scoped to Google's Hosting API.

Requires google-auth and requests. Set GOOGLE_APPLICATION_CREDENTIALS to an
authorized service-account file outside this repository. --publish makes the
finalized version live; without it this only stages the Hosting version.
"""
import argparse
import gzip
import hashlib
import json
import os
import pathlib
from urllib.parse import urlparse

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

ROOT = pathlib.Path(__file__).resolve().parents[1]
API = 'https://firebasehosting.googleapis.com/v1beta1/'


def deploy(publish=False, receipt=None):
    config = json.loads((ROOT / 'firebase.json').read_text())['hosting']
    assert config['site'] == 'oumagachat'
    public = ROOT / config['public']
    manifest = json.loads((public / 'app-updates/android.json').read_text())
    apk_url = manifest['channels']['apk']['url']
    parsed = urlparse(apk_url)
    assert parsed.scheme == 'https' and parsed.hostname == 'fcjgbbmfqdkucfpqjxae.supabase.co'
    assert parsed.path.startswith('/storage/v1/object/public/gaga-app-releases/')
    assert parsed.path.endswith('/' + manifest['latestVersionName'] + '/GaGa-' + manifest['latestVersionName'] + '-release.apk')
    # Public download verification uses no Google credential or shared session.
    with requests.get(apk_url, timeout=120, stream=True) as download:
        download.raise_for_status()
        digest, size = hashlib.sha256(), 0
        for chunk in download.iter_content(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    assert size == manifest['channels']['apk']['sizeBytes']
    assert digest.hexdigest() == manifest['channels']['apk']['sha256']
    credential = service_account.Credentials.from_service_account_file(
        os.environ['GOOGLE_APPLICATION_CREDENTIALS'], scopes=['https://www.googleapis.com/auth/firebase.hosting'])
    assert credential.project_id == 'oumagachat'
    credential.refresh(Request())

    def api(method, url, **kwargs):
        assert urlparse(url).hostname in {'firebasehosting.googleapis.com', 'upload-firebasehosting.googleapis.com'}
        headers = {'Authorization': 'Bearer ' + credential.token, **kwargs.pop('headers', {})}
        response = requests.request(method, url, headers=headers, timeout=120, allow_redirects=False, **kwargs)
        if not response.ok:
            raise RuntimeError(f'Hosting request failed: HTTP {response.status_code} {response.text[:300]}')
        return response.json() if response.content and 'json' in response.headers.get('content-type', '') else {}

    previous = api('GET', API + 'sites/oumagachat/releases?pageSize=1')['releases'][0]
    hosting = {'cleanUrls': config.get('cleanUrls', False),
               'headers': [{'glob': x['source'], 'headers': {h['key']: h['value'] for h in x['headers']}} for x in config.get('headers', [])],
               'redirects': [{'glob': x['source'], 'location': x['destination'], 'statusCode': x['type']} for x in config.get('redirects', [])],
               'rewrites': [{'glob': x['source'], 'path': x['destination']} for x in config.get('rewrites', [])]}
    version = api('POST', API + 'sites/oumagachat/versions', json={'config': hosting})
    files, compressed = {}, {}
    for path in sorted(public.rglob('*')):
        if not path.is_file():
            continue
        assert path.suffix.lower() not in {'.apk', '.aab', '.exe'}, 'Binary artifacts belong in the release bucket'
        assert not path.is_symlink()
        payload = gzip.compress(path.read_bytes(), mtime=0)
        digest = hashlib.sha256(payload).hexdigest()
        files['/' + path.relative_to(public).as_posix()] = digest
        compressed[digest] = payload
    result = api('POST', API + version['name'] + ':populateFiles', json={'files': files})
    required = result.get('uploadRequiredHashes', [])
    print(f'Hosting version {version["name"]}: {len(files)} files, {len(required)} uploads', flush=True)
    for digest in required:
        api('POST', result['uploadUrl'] + '/' + digest, data=compressed[digest], headers={'Content-Type': 'application/octet-stream'})
    finalized = api('PATCH', API + version['name'] + '?update_mask=status', json={'status': 'FINALIZED'})
    assert finalized['status'] == 'FINALIZED'
    record = {'version': version['name'], 'previousVersion': previous['version']['name'],
              'appVersion': manifest['latestVersionName'], 'fileCount': len(files), 'published': False}
    if publish:
        released = api('POST', API + 'sites/oumagachat/releases', params={'versionName': version['name']}, json={'message': 'Verified signed GaGa ' + manifest['latestVersionName']})
        record.update(published=True, release=released['name'], releaseTime=released.get('releaseTime'))
    if receipt:
        receipt.write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--receipt', type=pathlib.Path)
    args = parser.parse_args()
    deploy(args.publish, args.receipt)
