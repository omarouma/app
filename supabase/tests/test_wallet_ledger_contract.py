"""Prevent historical GaGa wallet ledger migrations from narrowing live types.

Source-only test. It never connects to Supabase or writes wallet balances.
Run: python3 -m unittest discover -s supabase/tests -p 'test_wallet_ledger_contract.py'
"""
import re
import unittest
from pathlib import Path

SQL = (Path(__file__).resolve().parents[1] / "migrations" /
       "20261016000000_wallet_ledger_hardening.sql")

# Audited against the live PostgreSQL wallet_transactions_type_check on
# 2026-10-20. Previous repo SQL had a smaller set, so replay on legacy
# data (reward, transfer, etc.) could fail or break interest/withdraw RPCs.
EXPECTED_TYPES = {
    "earn", "spend", "transfer", "transfer_in", "transfer_out", "receive",
    "reward", "refund", "topup", "withdraw", "convert", "tip", "split",
    "challenge", "adjust", "interest", "checkin",
}


def allowed_types_in_migration(source: str) -> set[str]:
    marker = "add constraint wallet_transactions_type_check"
    if source.count(marker) != 1:
        raise ValueError("Wallet constraint missing or duplicated")
    statement = source.split(marker, 1)[1]
    match = re.search(r"check\s*\(\s*type\s+in\s*\((.*?)\)\s*\)\s*;", statement, re.S | re.I)
    if not match:
        raise ValueError("Wallet type constraint malformed")
    return set(re.findall(r"'([a-z_]+)'", match.group(1)))


class WalletLedgerMigrationTest(unittest.TestCase):
    def test_live_compatible_transaction_types(self):
        actual = allowed_types_in_migration(SQL.read_text(encoding="utf-8"))
        self.assertEqual(actual, EXPECTED_TYPES)

    def test_previously_missing_production_kinds_are_permitted(self):
        actual = allowed_types_in_migration(SQL.read_text(encoding="utf-8"))
        self.assertTrue({"transfer", "reward", "interest", "withdraw", "checkin"} <= actual)

    def test_narrowed_migration_is_detected(self):
        old = ("alter table public.wallet_transactions "
               "add constraint wallet_transactions_type_check "
               "check (type in ('earn','spend','convert'));")
        actual = allowed_types_in_migration(old)
        self.assertNotEqual(actual, EXPECTED_TYPES)


if __name__ == "__main__":
    unittest.main()
