"""Fail closed on unsigned/partially signed AABs, including jarsigner exit 0.

An upload certificate is self-signed, so strict jarsigner exit bit 4 (an
untrusted certificate chain) is allowed. Other strict errors are not.
The caller must separately check the certificate against the approved pin.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess


def verify_aab_signature(path: Path) -> str:
    result = subprocess.run(
        ["jarsigner", "-J-Duser.language=en", "-J-Duser.country=US",
         "-verify", "-strict", str(path)],
        text=True, capture_output=True, check=False,
    )
    report = result.stdout + "\n" + result.stderr
    # jarsigner returns success for an unsigned archive without -strict.
    # Strict bit 16 also detects an unsigned entry appended to a signed JAR.
    if (result.returncode not in (0, 4)
            or not re.search(r"^jar verified[.,]", report, re.MULTILINE)
            or re.search(r"unsigned entries|jar is unsigned|treated as unsigned|"
                         r"certificate has expired|certificate is not yet valid",
                         report, re.IGNORECASE)):
        raise ValueError("AAB signature verification failed; publication is blocked")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("aab", type=Path)
    args = parser.parse_args()
    verify_aab_signature(args.aab)
    print("AAB cryptographic signature and complete entry coverage verified")
