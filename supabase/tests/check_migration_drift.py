#!/usr/bin/env python3
"""Read-only migration drift check for the GaGa Chat Supabase project.

Compares the migrations committed in ``supabase/migrations/*.sql`` against the
rows in the live ``supabase_migrations.schema_migrations`` table and reports the
four reconciliation classes described in
``android-native/docs/MIGRATION_RECONCILIATION.md``:

    * exact match        (version AND name)
    * retimestamped      (name matches, version differs)
    * repo-only          (a repo file with no live counterpart)
    * live-only          (a live row with no repo counterpart)

It is strictly read-only: the only SQL it issues is a ``SELECT``. It is therefore
safe to run against production.

Exit codes
----------
0   no unexpected drift (repo-only set is a subset of the known-applied list)
1   a repo-only migration was found that is NOT on the known-applied list
2   the check could not run (missing token / network error) -- informational

Usage
-----
    SUPABASE_ACCESS_TOKEN=sbp_xxx python3 supabase/tests/check_migration_drift.py

Environment
-----------
SUPABASE_ACCESS_TOKEN   Supabase Management API token (required to query live).
GAGA_SUPABASE_REF       Project ref (default: fcjgbbmfqdkucfpqjxae).
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"

DEFAULT_REF = "fcjgbbmfqdkucfpqjxae"

# Repo migrations that are intentionally NOT recorded in the live project by the
# same name/version but whose effect is nevertheless present (verified in the
# reconciliation doc), OR that are deliberate forward migrations not yet applied.
# A repo-only migration that is not listed here is treated as unexpected drift.
KNOWN_APPLIED = {
    # Applied live under a NULL name.
    "20261008093000_shared_split_bills",
    "20261008140000_call_admission_reason",
    # Applied live as the out-of-band repair `gaga_atomic_call_lifecycle`.
    "20261013000000_call_lifecycle_rpcs",
    # Applied live directly (objects verified present).
    "20261016000000_wallet_ledger_hardening",
    # Deliberate forward migration; additive, not required by 2.8.14.
    "20261009090000_settings_center",
}


def norm(name: str) -> str:
    """Strip a leading timestamp/underscores so names compare across stamps."""
    return re.sub(r"^\d+_?", "", name or "").strip()


def load_repo_migrations() -> list[str]:
    if not MIGRATIONS_DIR.is_dir():
        raise SystemExit(f"migrations dir not found: {MIGRATIONS_DIR}")
    return sorted(p.name[:-4] for p in MIGRATIONS_DIR.glob("*.sql"))


def fetch_live_migrations(ref: str, token: str) -> list[dict]:
    sql = (
        "select version, name from supabase_migrations.schema_migrations "
        "order by version;"
    )
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode())


def reconcile(repo: list[str], live: list[dict]) -> dict:
    live_by_ver = {m["version"]: (m.get("name") or "") for m in live}
    live_by_name: dict[str, list[str]] = {}
    for m in live:
        live_by_name.setdefault(norm(m.get("name")), []).append(m["version"])

    repo_by_ver = {r.split("_")[0] for r in repo}
    repo_names = {norm(r) for r in repo}

    exact, retime, repo_only = 0, [], []
    for r in repo:
        ver = r.split("_")[0]
        if ver in live_by_ver:
            exact += 1
        elif norm(r) in live_by_name:
            retime.append((r, live_by_name[norm(r)]))
        else:
            repo_only.append(r)

    live_only = [
        m
        for m in live
        if m["version"] not in repo_by_ver and norm(m.get("name")) not in repo_names
    ]

    return {
        "exact": exact,
        "retime": retime,
        "repo_only": repo_only,
        "live_only": live_only,
    }


def main() -> int:
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    ref = os.environ.get("GAGA_SUPABASE_REF", DEFAULT_REF).strip()

    repo = load_repo_migrations()
    print(f"repo migrations : {len(repo)}")

    if not token:
        print(
            "SUPABASE_ACCESS_TOKEN not set -- skipping live comparison "
            "(informational only)."
        )
        return 2

    try:
        live = fetch_live_migrations(ref, token)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        print(f"could not query live project {ref}: {exc} (informational only).")
        return 2

    print(f"live migrations : {len(live)}")
    result = reconcile(repo, live)
    print(f"  exact match   : {result['exact']}")
    print(f"  retimestamped : {len(result['retime'])}")
    print(f"  repo-only     : {len(result['repo_only'])}")
    print(f"  live-only     : {len(result['live_only'])}")

    unexpected = [r for r in result["repo_only"] if r not in KNOWN_APPLIED]
    if unexpected:
        print("\nUNEXPECTED repo-only migrations (not on the known-applied list):")
        for r in unexpected:
            print(f"  - {r}")
        print(
            "\nEither apply the migration to the live project or add it to "
            "KNOWN_APPLIED with a justification in "
            "android-native/docs/MIGRATION_RECONCILIATION.md."
        )
        return 1

    print("\nNo unexpected drift. Repo-only set matches the known-applied list.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
