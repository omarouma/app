#!/usr/bin/env python3
"""Fail closed on unexpected GaGa Supabase migration-history drift.

Default: verify GitHub SQL filenames against an audited, read-only production
inventory snapshot. --online additionally reads the live migration history using
a *management* token from SUPABASE_ACCESS_TOKEN (never logged).

No INSERT/UPDATE/DDL, migration repair, credentials or user rows.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
MIG_DIR = ROOT / "supabase" / "migrations"
SNAPSHOT = Path(__file__).with_name("live_migration_inventory_20261020.json")
PROJECT_REF = "fcjgbbmfqdkucfpqjxae"

# These are explicitly NOT matching migration-history versions. Their schema
# effects require separate, documented object/definition checks before replay.
DOCUMENTED_EXCEPTIONS = {
    "20261009090000_settings_center": "forward_only_not_deployed",
    "20261013000000_call_lifecycle_rpcs": "out_of_band_call_repair",
    "20261016000000_wallet_ledger_hardening": "out_of_band_wallet_repair",
}


def names_from_repository(directory: Path = MIG_DIR) -> list[str]:
    if not directory.is_dir():
        raise ValueError("Missing local migration folder")
    names = sorted(p.stem for p in directory.glob("*.sql"))
    if len(names) != len(set(names)):
        raise ValueError("Duplicate migration filenames")
    for name in names:
        if not re.fullmatch(r"\d{8,14}_[a-z][a-z0-9_]*", name):
            raise ValueError("Malformed migration filename: " + name)
    return names


def canonical_live(rows: list[dict]) -> dict[str, str | None]:
    result: dict[str, str | None] = {}
    for item in rows:
        version, name = str(item["version"]), item.get("name")
        if not version.isdecimal() or (name is not None and not isinstance(name, str)):
            raise ValueError("Malformed live migration entry")
        if version in result:
            raise ValueError("Duplicate applied migration version: " + version)
        result[version] = name
    return result


def reconcile(repo_names: list[str], live_rows: list[dict]) -> dict:
    live = canonical_live(live_rows)
    by_name: dict[str, list[str]] = {}
    for version, name in live.items():
        if name:
            by_name.setdefault(name, []).append(version)
    matched_versions: set[str] = set()
    exact: list[str] = []
    retimestamped: list[dict] = []
    exceptions: list[dict] = []
    unexpected: list[str] = []
    for full in repo_names:
        version, name = full.split("_", 1)
        if version in live:
            if live[version] not in (None, "", name):
                unexpected.append(full + ": conflicting live name " + str(live[version]))
            else:
                exact.append(full)
                matched_versions.add(version)
        elif name in by_name:
            match = by_name[name]
            if len(match) != 1:
                unexpected.append(full + ": ambiguous live name")
            else:
                matched_versions.add(match[0])
                retimestamped.append({"repository": full, "live_version": match[0]})
        elif full in DOCUMENTED_EXCEPTIONS:
            exceptions.append({"repository": full, "reason": DOCUMENTED_EXCEPTIONS[full]})
        else:
            unexpected.append(full)
    return {
        "exact": exact,
        "retimestamped": retimestamped,
        "documented_exceptions": exceptions,
        "untracked_repository_migrations": unexpected,
        "historical_live_only": [
            {"version": version, "name": name}
            for version, name in live.items() if version not in matched_versions
        ],
    }


def load_snapshot(path: Path = SNAPSHOT) -> dict:
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    if snapshot.get("project_ref") != PROJECT_REF:
        raise ValueError("Snapshot project does not match the GaGa production ref")
    canonical_live(snapshot["migrations"])
    return snapshot


def fetch_live(token: str, project: str = PROJECT_REF) -> list[dict]:
    if not token or project != PROJECT_REF:
        raise ValueError("Management token and expected project ref required")
    sql = ("select version, name from supabase_migrations.schema_migrations "
           "order by version")
    req = urllib.request.Request(
        "https://api.supabase.com/v1/projects/" + project + "/database/query",
        data=json.dumps({"query": sql}).encode("utf-8"),
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        rows = json.loads(response.read())
    if not isinstance(rows, list):
        raise ValueError("Unexpected live migration API result")
    canonical_live(rows)
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--online", action="store_true",
                        help="Read only live migration history using a private access token")
    args = parser.parse_args(argv)
    snapshot = load_snapshot()
    repo = names_from_repository()
    result = reconcile(repo, snapshot["migrations"])
    print("GaGa migration inventory: %d GitHub files, %d historical live rows" %
          (len(repo), len(snapshot["migrations"])))
    for key in ("exact", "retimestamped", "documented_exceptions",
                "untracked_repository_migrations", "historical_live_only"):
        print("  %s: %d" % (key, len(result[key])))
    if result["documented_exceptions"]:
        print("WARNING: out-of-band effects and forward migrations are NOT "
              "proved equivalent by this metadata check.")
    if result["untracked_repository_migrations"]:
        print("BLOCK: New repo-only migrations need explicit reconciliation:")
        for name in result["untracked_repository_migrations"]:
            print(" - " + name)
        return 1
    if args.online:
        token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
        if not token:
            print("BLOCK: SUPABASE_ACCESS_TOKEN missing; cannot verify current production.")
            return 2
        try:
            live = fetch_live(token)
        except (ValueError, OSError, urllib.error.URLError) as exc:
            # Do not print tool exception text; it may contain auth headers.
            print("BLOCK: Production migration history could not be checked.")
            return 2
        if canonical_live(live) != canonical_live(snapshot["migrations"]):
            print("BLOCK: Production migration history changed since audited snapshot. "
                  "Investigate, review DDL and update snapshot.")
            return 1
        print("Live applied migration history matches the audited snapshot.")
    else:
        print("Offline inventory only. NOT a live connectivity, SQL definition, "
              "RLS or feature verification.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
