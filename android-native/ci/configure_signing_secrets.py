"""Install release signing secrets with an authenticated gh CLI. Never prints secrets."""
import argparse, base64, json, subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--keystore", required=True, type=Path)
parser.add_argument("--credentials", required=True, type=Path)
args = parser.parse_args()
creds = json.loads(args.credentials.read_text())
values = {
    "GAGA_RELEASE_KEYSTORE_BASE64": base64.b64encode(args.keystore.read_bytes()).decode(),
    "GAGA_RELEASE_STORE_PASSWORD": creds["store_password"],
    "GAGA_RELEASE_KEY_ALIAS": creds["alias"],
    "GAGA_RELEASE_KEY_PASSWORD": creds["key_password"],
}
for name, value in values.items():
    subprocess.run(["gh", "secret", "set", name, "--repo", "omarouma/app"], input=value, text=True, check=True)
    print(name + ": configured")
