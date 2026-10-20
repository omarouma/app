"""Offline source/configuration tests for the GaGa Supabase↔Firebase bridge.

No live Firebase SDK calls, Admin private keys or real user tokens are used.
Run from repository root:
    python3 -m unittest discover -s supabase/tests -p 'test_firebase_supabase_identity.py'
"""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = json.loads((ROOT / "android-native/ci/backend-public.json").read_text(encoding="utf-8"))
EXPECTED_PROJECT = "oumagachat"
TOKEN_SOURCE = (ROOT / "supabase/functions/firebase-token/index.ts").read_text(encoding="utf-8")
FCM_SOURCE = (ROOT / "supabase/functions/send-fcm-push/index.ts").read_text(encoding="utf-8")


class FirebaseSupabaseIdentityTest(unittest.TestCase):
    def test_website_and_android_reference_same_firebase_project(self):
        self.assertEqual(PUBLIC["firebase"]["project_id"], EXPECTED_PROJECT)
        self.assertEqual(json.loads((ROOT / ".firebaserc").read_text(encoding="utf-8"))
                         ["projects"]["default"], EXPECTED_PROJECT)
        self.assertEqual(json.loads((ROOT / "firebase.json").read_text(encoding="utf-8"))
                         ["hosting"]["site"], EXPECTED_PROJECT)

    def test_android_client_and_live_supabase_reference_same_project(self):
        self.assertEqual(PUBLIC["SUPABASE_URL"], "https://fcjgbbmfqdkucfpqjxae.supabase.co")
        self.assertTrue(PUBLIC["firebase"]["google_app_id"].startswith("1:"))
        self.assertTrue(PUBLIC["firebase"]["android_oauth_clients"])

    def test_firebase_custom_token_mint_does_not_use_project_fallback(self):
        self.assertIn("const FIREBASE_PROJECT_ID = (Deno.env.get('FIREBASE_PROJECT_ID') ?? '').trim();",
                      TOKEN_SOURCE)
        self.assertNotIn("Deno.env.get('FIREBASE_PROJECT_ID') ?? 'oumagachat'", TOKEN_SOURCE)
        self.assertIn("error: 'FIREBASE_NOT_CONFIGURED'", TOKEN_SOURCE)
        self.assertIn("error: 'SUPABASE_NOT_CONFIGURED'", TOKEN_SOURCE)

    def test_custom_token_needs_authenticated_supabase_user(self):
        self.assertIn("await authenticate(req)", TOKEN_SOURCE)
        self.assertIn("await fetch(`${SUPABASE_URL}/auth/v1/user`", TOKEN_SOURCE)
        self.assertIn("const uid = callerId;", TOKEN_SOURCE)
        self.assertIn("'Cache-Control': 'private, no-store", TOKEN_SOURCE)
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", TOKEN_SOURCE)

    def test_fcm_sender_requires_server_side_credentials(self):
        self.assertIn('FCM_PROJECT_ID', FCM_SOURCE)
        self.assertIn('FCM_PRIVATE_KEY', FCM_SOURCE)
        self.assertIn('PUSH_WEBHOOK_SECRET', FCM_SOURCE)
        self.assertIn('if (!authorized) return json({ error: "UNAUTHORIZED" }, 401)', FCM_SOURCE)


if __name__ == "__main__":
    unittest.main()
