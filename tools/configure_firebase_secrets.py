"""Rotate GaGa's server signing secrets using an authenticated Supabase CLI.

The service-account file stays local. No key or password is printed or committed.
"""
import argparse
import json
import os
import re
import shutil
import base64
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--credentials', required=True, type=Path)
args = parser.parse_args()
credentials = json.loads(args.credentials.read_text())
if credentials.get('type') != 'service_account' or credentials.get('project_id') != 'oumagachat':
    parser.error('Use the oumagachat service-account JSON file')
email = credentials.get('client_email', '')
key = credentials.get('private_key', '')
key = key.replace('\r\n', '\n')
if not re.fullmatch(r'[A-Za-z0-9._-]+@oumagachat\.iam\.gserviceaccount\.com', email) or not re.fullmatch(r'-----BEGIN PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PRIVATE KEY-----\n?', key):
    parser.error('Invalid Firebase service-account identity or private-key format')
base64.b64decode(''.join(key.splitlines()[1:-1]), validate=True)
if not shutil.which('supabase'):
    parser.error('Install and authenticate the Supabase CLI first')
help_result = subprocess.run(['supabase', 'secrets', 'set', '--help'], capture_output=True, text=True)
if help_result.returncode or '--env-file' not in help_result.stdout:
    parser.error('This Supabase CLI does not support the required secrets --env-file operation')
values = {}
for prefix in ('FCM', 'FIREBASE'):
    values[prefix + '_PROJECT_ID'] = 'oumagachat'
    values[prefix + '_CLIENT_EMAIL'] = email
    # Store escaped newlines; both deployed functions normalize them on read.
    values[prefix + '_PRIVATE_KEY'] = key.replace('\n', '\\n')
fd, name = tempfile.mkstemp(prefix='gaga-firebase-', suffix='.env')
try:
    os.chmod(name, 0o600)
    with os.fdopen(fd, 'w') as output:
        for setting, value in values.items():
            output.write(setting + '=' + value + '\n')
    result = subprocess.run(['supabase', 'secrets', 'set', '--project-ref',
        'fcjgbbmfqdkucfpqjxae', '--env-file', name], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit('Secret update failed. Check Supabase CLI authentication and project access; no credentials were printed.')
    print('Firebase and FCM signing secrets updated. Re-run backend qualification before claiming push/sign-in success.')
finally:
    Path(name).unlink(missing_ok=True)
