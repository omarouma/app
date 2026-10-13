#!/usr/bin/env bash
# Reproducible wallet-ledger verification harness.
#
# Spins up a throwaway PostgreSQL database that mirrors the LIVE Supabase schema
# (uuid ids, the legacy `type` CHECK constraint, the columns/tables that are
# missing in production), applies the wallet-ledger-hardening migration, then
# runs 18 functional + security assertions. Nothing here touches production.
#
# Requirements: a local PostgreSQL 15 cluster you can create databases on
# (the harness creates the anon / authenticated / service_role roles and an
# `auth` schema, so run it against a scratch cluster, not a real Supabase DB).
#
# Usage:
#   PGPORT=5433 ./run.sh
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
MIG="$ROOT/supabase/migrations/20261016000000_wallet_ledger_hardening.sql"

PORT="${PGPORT:-5432}"
DB="${PGDATABASE:-gaga_wallet_test}"

echo "### rebuilding '$DB' on port $PORT"
dropdb   -p "$PORT" --if-exists "$DB"
createdb -p "$PORT" "$DB"

echo "### harness (live-accurate schema)"
psql -p "$PORT" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/harness.sql"

echo "### migration"
psql -p "$PORT" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG"

echo "### tests"
psql -p "$PORT" -d "$DB" -q -f "$HERE/test.sql"

echo
echo "### done — every line above should read PASS."
