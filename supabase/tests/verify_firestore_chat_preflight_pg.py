#!/usr/bin/env python3
"""Run GaGa's aggregate-only Firestore-mirror preflight on disposable CI data.

Only connects to CI PostgreSQL (PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD).
Do not point this at production. This script creates synthetic fixtures,
then asserts each of the three read-only preflight result sets.
"""
from __future__ import annotations

import csv
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PREFLIGHT = ROOT / "supabase/tests/firestore_chat_mirror_preflight.sql"
FIXTURE = ROOT / "supabase/functions/trusted-chat-mirror/tests/preflight.pg.sql"


def psql(*args: str) -> str:
    result = subprocess.run(
        ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
         *args],
        cwd=ROOT, check=True, text=True, capture_output=True,
        timeout=30,
    )
    return result.stdout


def main() -> None:
    # Fail early if someone edits the audit into a destructive migration.
    # The fixture itself is *only* used on an ephemeral PostgreSQL CI service.
    source = re.sub(r"--[^\n]*", "", PREFLIGHT.read_text(encoding="utf-8"))
    if re.search(r"\b(insert|update|delete|alter|drop|truncate|grant|revoke|create|call|perform)\b", source, re.I):
        raise RuntimeError("Preflight must remain a read-only SELECT-only audit")
    statements = [part.strip() for part in source.split(";") if part.strip()]
    if len(statements) != 3 or any(
        not re.match(r"^(select|with)\\b", stmt, re.I) for stmt in statements
    ):
        raise RuntimeError("Preflight must contain exactly three SELECT/CTE queries")
    psql("-f", str(FIXTURE))
    out = psql("-t", "-A", "-F", ",", "-f", str(PREFLIGHT))
    numeric = [row for row in csv.reader(out.splitlines())
               if row and all(re.fullmatch(r"[0-9]+", x or "") for x in row)]
    if len(numeric) != 3:
        raise AssertionError(f"Expected 3 numeric aggregate-only result rows, got {len(numeric)}")
    counts = [[int(x) for x in row] for row in numeric]
    if counts[0] != [5, 4, 1, 0, 0, 0, 0, 0, 1, 0, 1]:
        raise AssertionError(f"Chat anomaly metrics changed unexpectedly: {counts[0]}")
    if counts[1] != [1, 0, 0, 0]:
        raise AssertionError(f"Group roster check regressed: {counts[1]}")
    if counts[2] != [1, 1, 1, 0, 1, 1, 0, 0]:
        raise AssertionError(f"Deleted-account membership check regressed: {counts[2]}")
    print("GaGa mirror preflight: 3 read-only queries passed synthetic orphan/duplicate/roster tests")


if __name__ == "__main__":
    main()
