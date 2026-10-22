"""Release artifact gate: never mistake an unsigned CI bundle for Play-ready.

Invoke after the signed/unsigned artifact packaging step.
For PRs and regular branch CI, report the unsigned validation output as such.
For a production-tagged or manually opted-in release, REQUIRE the approved
keystore fingerprint check to have succeeded and verify signed outputs exist.

This does NOT substitute for Google Play App Signing registration, final
upload-key verification, Firebase Cloud Messaging delivery tests, or Play review.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def verify_signed_artifacts(apk: Path, aab: Path, version: str) -> bool:
    """Verify the bytes rather than trusting filenames or a saved text report."""
    try:
        pin = json.loads((ROOT / "ci/release-signing-public.json").read_text())
        sdk = os.getenv("ANDROID_HOME") or os.getenv("ANDROID_SDK_ROOT")
        tools = sorted((Path(sdk) / "build-tools").glob("*")) if sdk else []
        def tool(name: str) -> str:
            found = shutil.which(name)
            if found:
                return found
            for directory in reversed(tools):
                candidate = directory / name
                if candidate.is_file():
                    return str(candidate)
            raise FileNotFoundError(name)
        def output(command: list[str]) -> str:
            return subprocess.check_output(command, text=True, stderr=subprocess.STDOUT)
        apk_report = output([tool("apksigner"), "verify", "--verbose", "--print-certs", str(apk)])
        certs = re.findall(r"Signer #[0-9]+ certificate SHA-256 digest: ([0-9a-fA-F]+)", apk_report)
        if len(certs) != 1 or certs[0].lower() != pin["sha256"].lower():
            return False
        output(["jarsigner", "-verify", str(aab)])
        aab_report = output(["keytool", "-printcert", "-jarfile", str(aab)])
        bundle_certs = re.findall(r"SHA256:\s*([0-9A-Fa-f:]+)", aab_report)
        if len(bundle_certs) != 1 or bundle_certs[0].replace(":", "").lower() != pin["sha256"].lower():
            return False
        identity = output([tool("aapt"), "dump", "badging", str(apk)])
        package = re.search(r"^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'", identity, re.MULTILINE)
        return package is not None and package[1] == pin["package"] and package[3] == version
    except (OSError, subprocess.SubprocessError, ValueError, KeyError):
        return False


def check(artifacts: Path, strict: bool, version: str, git_ref: str) -> bool:
    notes = []
    assert re.fullmatch(r"[0-9]+(?:\.[0-9]+){2}", version), "Invalid release version"
    if git_ref.startswith("refs/tags/android-"):
        assert git_ref == f"refs/tags/android-{version}", (
            "GitHub tag must match the version baked into the Android build"
        )
    unsigned_apk = artifacts / f"GaGa-{version}-release-unsigned.apk"
    unsigned_aab = artifacts / f"GaGa-{version}-release-unsigned.aab"
    assert unsigned_apk.is_file() and unsigned_apk.stat().st_size > 0
    assert unsigned_aab.is_file() and unsigned_aab.stat().st_size > 0
    notes.append("Unsigned build artifacts: present")

    signed_apk = artifacts / f"GaGa-{version}-release.apk"
    signed_aab = artifacts / f"GaGa-{version}-release.aab"
    signature_report = artifacts / "signature-verification.txt"
    compatibility = artifacts / "UPDATE-COMPATIBILITY.txt"
    signed = all(x.is_file() and x.stat().st_size > 0
                 for x in (signed_apk, signed_aab, signature_report, compatibility))
    if signed:
        signed = verify_signed_artifacts(signed_apk, signed_aab, version)
    notes.append("Matching-key signed APK/AAB and verification: " +
                 ("present" if signed else "NOT PRESENT"))
    notes.append("Play Store/App Signing account validation: still required")
    if strict and not signed:
        notes.append("PRODUCTION RELEASE BLOCKED — matching original keystore unavailable")
    elif strict:
        notes.append("CI signing gate passed — proceed to Play prelaunch/device verification")
    else:
        notes.append("Development CI result only; unsigned artifacts are NOT Play-ready")

    (artifacts / "PRODUCTION-READINESS.txt").write_text("\n".join(notes) + "\n")
    if strict and not signed:
        return False
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifacts", default="deliverables")
    parser.add_argument("--version", required=True)
    parser.add_argument("--strict", action="store_true")
    opts = parser.parse_args()
    okay = check(Path(opts.artifacts), opts.strict, opts.version, os.getenv("GITHUB_REF", ""))
    print((Path(opts.artifacts) / "PRODUCTION-READINESS.txt").read_text())
    raise SystemExit(0 if okay else 1)
