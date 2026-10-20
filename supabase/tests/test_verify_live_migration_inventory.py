"""Offline regression suite for the GaGa production migration-history guard.

Run from repository root:
    python3 -m unittest discover -s supabase/tests -p 'test_verify_live_migration_inventory.py'
No network access or database mutations.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

FILE = Path(__file__).with_name("verify_live_migration_inventory.py")
spec = importlib.util.spec_from_file_location("migration_inventory", FILE)
assert spec and spec.loader
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class MigrationInventoryTest(unittest.TestCase):
    def test_checked_in_baseline_has_expected_production_inventory(self):
        snap = audit.load_snapshot()
        self.assertEqual(len(snap["migrations"]), 117)
        self.assertEqual(snap["project_ref"], audit.PROJECT_REF)
        result = audit.reconcile(audit.names_from_repository(), snap["migrations"])
        self.assertEqual(len(result["exact"]), 46)
        self.assertEqual(len(result["retimestamped"]), 15)
        self.assertEqual(len(result["documented_exceptions"]), 3)
        self.assertEqual(len(result["historical_live_only"]), 56)
        self.assertEqual(result["untracked_repository_migrations"], [])
        self.assertEqual({x["repository"] for x in result["documented_exceptions"]},
                         set(audit.DOCUMENTED_EXCEPTIONS))

    def test_unexpected_new_repo_migration_blocks_audit(self):
        result = audit.reconcile(
            ["20261021120000_unreviewed_policy.sql".removesuffix(".sql")],
            [{"version": "20261021110000", "name": "known_migration"}],
        )
        self.assertEqual(result["untracked_repository_migrations"],
                         ["20261021120000_unreviewed_policy"])

    def test_same_version_conflicting_name_is_not_exact(self):
        result = audit.reconcile(
            ["20261021120000_safe_policy"],
            [{"version": "20261021120000", "name": "different_policy"}],
        )
        self.assertEqual(result["exact"], [])
        self.assertTrue(result["untracked_repository_migrations"])

    def test_retimestamps_are_explicitly_recorded(self):
        result = audit.reconcile(
            ["20261021120000_safe_policy"],
            [{"version": "20261021123145", "name": "safe_policy"}],
        )
        self.assertEqual(result["retimestamped"][0]["live_version"], "20261021123145")
        self.assertEqual(result["untracked_repository_migrations"], [])

    def test_ambiguous_duplicate_names_require_manual_resolution(self):
        result = audit.reconcile(
            ["20261021120000_safe_policy"],
            [{"version": "20261021123145", "name": "safe_policy"},
             {"version": "20261021123146", "name": "safe_policy"}],
        )
        self.assertTrue(result["untracked_repository_migrations"])

    def test_live_snapshot_duplicate_version_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            audit.canonical_live([{"version": "20261020", "name": "a"},
                                  {"version": "20261020", "name": "b"}])

    def test_default_main_is_offline_and_never_fetches_credentials(self):
        with patch.object(audit, "fetch_live") as fetch, patch.object(audit, "load_snapshot") as snap:
            snap.return_value = {"project_ref": audit.PROJECT_REF,
                                 "migrations": [{"version": "20261020000000",
                                                 "name": "known"}]}
            with patch.object(audit, "names_from_repository", return_value=["20261020000000_known"]):
                self.assertEqual(audit.main([]), 0)
            fetch.assert_not_called()

    def test_online_drift_fails_without_modifying_database(self):
        expected = [{"version": "20261020000000", "name": "known"}]
        changed = expected + [{"version": "20261021120000", "name": "unreviewed"}]
        with patch.object(audit, "load_snapshot", return_value={
            "project_ref": audit.PROJECT_REF, "migrations": expected
        }):
            with patch.object(audit, "names_from_repository",
                              return_value=["20261020000000_known"]):
                with patch.dict("os.environ", {"SUPABASE_ACCESS_TOKEN": "fake"}, clear=False):
                    with patch.object(audit, "fetch_live", return_value=changed) as fetch:
                        self.assertEqual(audit.main(["--online"]), 1)
                    fetch.assert_called_once()


if __name__ == "__main__":
    unittest.main()
