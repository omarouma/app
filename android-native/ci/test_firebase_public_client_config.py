"""Ensure Google Services includes only approved PUBLIC client config."""
from pathlib import Path
import json
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ci"))
# Run the separate Firebase Firestore rules regression suite as part of
# the already-enabled Android CI public-Firebase-config test gate.
sys.path.insert(0, str(ROOT.parent / "firebase" / "tests"))
from test_firestore_security_rules import FirebaseRulesHardeningTests  # noqa: F401

class FirebaseClientConfigTest(unittest.TestCase):
    def test_android_oauth_certificate_matches_public_manifest(self):
        config = json.loads((ROOT / "ci/backend-public.json").read_text())["firebase"]
        clients = json.loads((ROOT / "app/google-services.json").read_text())["client"]
        release = next(c for c in clients if c["client_info"]["android_client_info"]["package_name"] == "gagachat.app")
        registered = {
            (x["client_id"], x["android_info"]["certificate_hash"])
            for x in release["oauth_client"] if x["client_type"] == 1
        }
        expected = {
            (x["client_id"], x["certificate_hash"]) for x in config["android_oauth_clients"]
        }
        self.assertEqual(registered, expected)
        self.assertIn(
            "cd2f9de5f1932c836d79573726e1033de44bedf9",
            {hash for _, hash in registered},
        )

    def test_no_admin_sdk_secrets_in_android_client_config(self):
        root = json.loads((ROOT / "app/google-services.json").read_text())
        raw = json.dumps(root).lower()
        for forbidden in ("private_key", "service_account", "firebase-adminsdk", "-----begin private key-----"):
            self.assertNotIn(forbidden, raw)
        self.assertEqual(root["project_info"]["project_id"], "oumagachat")
        self.assertTrue(any(
            c["client_info"]["android_client_info"]["package_name"] == "gagachat.app.debug"
            for c in root["client"]
        ))

if __name__ == "__main__":
    unittest.main()
