"""Verify an existing GaGa upload key, optionally configure GitHub secrets.

Safely run locally, never in a hosted public log:

  python3 android-native/ci/configure_signing_secrets.py \
      --base64-file GAGA_RELEASE_KEYSTORE_BASE64.txt --verify-only
  python3 android-native/ci/configure_signing_secrets.py \
      --base64-file GAGA_RELEASE_KEYSTORE_BASE64.txt --configure

The default command only VERIFIES. --configure is an explicit owner action.
No private key, base64 content, password or token is ever printed or committed.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import getpass
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from typing import Callable

PIN_FILE = Path(__file__).with_name("release-signing-public.json")
REPOSITORY = "omarouma/app"
MAX_KEYSTORE_BYTES = 256 * 1024


def decode_base64_keystore(encoded: bytes) -> bytes:
    """Strictly decode a wrapped Base64 input without revealing the payload."""
    compact = b"".join(encoded.split())
    try:
        data = base64.b64decode(compact, validate=True)
    except binascii.Error as exc:
        raise ValueError("Input is not valid Base64") from exc
    if not 32 <= len(data) <= MAX_KEYSTORE_BYTES or not data.startswith(b"\x30"):
        raise ValueError("Decoded file does not resemble a DER PKCS#12 keystore")
    return data


def expected_identity() -> tuple[str, str]:
    public = json.loads(PIN_FILE.read_text(encoding="utf-8"))
    fingerprint = public["sha256"].lower()
    if (public["package"] != "gagachat.app" or
            public["alias"] != "gaga" or
            len(fingerprint) != 64 or
            any(c not in "0123456789abcdef" for c in fingerprint)):
        raise ValueError("Public release signing pin is invalid")
    return public["alias"], fingerprint


def verify_certificate(keystore: Path, alias: str, password: str, expected: str) -> None:
    """Use keytool to export only the PUBLIC certificate, then compare SHA-256."""
    if not password:
        raise ValueError("Keystore password is required")
    env = os.environ.copy()
    env["GAGA_RELEASE_STORE_PASSWORD"] = password
    try:
        result = subprocess.run(
            ["keytool", "-exportcert", "-keystore", str(keystore),
             "-storetype", "PKCS12", "-alias", alias,
             "-storepass:env", "GAGA_RELEASE_STORE_PASSWORD"],
            capture_output=True, check=True, env=env,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        # The subprocess error may contain tool output; deliberately omit it.
        raise RuntimeError(
            "Could not open keystore. Check the existing store password and alias locally."
        ) from None
    if hashlib.sha256(result.stdout).hexdigest() != expected:
        raise ValueError(
            "Signing certificate mismatch: this is NOT GaGa's approved Play upload key. "
            "Nothing was uploaded."
        )


def set_actions_secrets(base64_value: str, store_password: str,
                        alias: str, key_password: str) -> None:
    """Use the authenticated gh CLI's stdin; never pass secrets on argv."""
    if not shutil.which("gh"):
        raise RuntimeError("GitHub CLI (gh) is unavailable; install it and authenticate locally")
    values = {
        "GAGA_RELEASE_KEYSTORE_BASE64": base64_value,
        "GAGA_RELEASE_STORE_PASSWORD": store_password,
        "GAGA_RELEASE_KEY_ALIAS": alias,
        "GAGA_RELEASE_KEY_PASSWORD": key_password,
    }
    for name, value in values.items():
        try:
            subprocess.run(
                ["gh", "secret", "set", name, "--repo", REPOSITORY],
                input=value, text=True, capture_output=True, check=True,
            )
        except (OSError, subprocess.CalledProcessError):
            # A partial configuration is possible. Re-run --configure after
            # resolving permissions; never echo gh output containing secrets.
            raise RuntimeError(
                f"Could not configure GitHub Actions secret {name}; "
                "earlier secrets may have been configured. Re-run safely."
            ) from None
        print(f"{name}: configured")


def run(argv: list[str] | None = None, prompt: Callable[[str], str] = getpass.getpass) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--base64-file", type=Path,
                        help="Existing Base64-encoded approved upload keystore")
    source.add_argument("--keystore", type=Path, help="Existing binary .jks/.p12 keystore")
    choice = parser.add_mutually_exclusive_group()
    choice.add_argument("--verify-only", action="store_true", help="Default, no upload")
    choice.add_argument("--configure", action="store_true",
                        help="After verifying, install encrypted GitHub Actions secrets")
    args = parser.parse_args(argv)

    alias, expected = expected_identity()
    path = args.base64_file or args.keystore
    if path.stat().st_size > MAX_KEYSTORE_BYTES * 2:
        raise ValueError("Keystore input is unexpectedly large")
    if args.base64_file:
        data = decode_base64_keystore(path.read_bytes())
    else:
        data = path.read_bytes()
        if not data.startswith(b"\x30"):
            raise ValueError("Keystore does not resemble PKCS#12 DER data")
    encoded = base64.b64encode(data).decode("ascii")

    password = os.getenv("GAGA_RELEASE_STORE_PASSWORD") or prompt(
        "Existing GaGa upload keystore password (not shown): "
    )

    # The temporary file is private and removed on every exit path.
    with tempfile.TemporaryDirectory(prefix="gaga-signing-") as folder:
        keystore = Path(folder) / "upload.p12"
        keystore.write_bytes(data)
        keystore.chmod(0o600)
        verify_certificate(keystore, alias, password, expected)

    print("Approved Play upload certificate: verified against public SHA-256 pin.")
    if not args.configure:
        print("Verification only. No GitHub secret, source or release was modified.")
        return 0

    key_password = os.getenv("GAGA_RELEASE_KEY_PASSWORD") or prompt(
        "Existing GaGa private key password (not shown): "
    )
    if not key_password:
        raise ValueError("Private key password is required")
    set_actions_secrets(encoded, password, alias, key_password)
    print("Encrypted Actions secrets submitted. Run the signed-candidate workflow "
          "on release/gaga-2.8.15-rc1; verify its signed artifact before distribution.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except (ValueError, RuntimeError, OSError) as error:
        # Expected validation errors contain no secret values.
        print(f"Signing configuration stopped: {error}", file=sys.stderr)
        raise SystemExit(1)
