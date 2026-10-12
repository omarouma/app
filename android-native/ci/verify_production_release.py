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
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


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
