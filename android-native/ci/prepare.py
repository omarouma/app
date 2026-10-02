"""Prepare public app configuration; private signing material stays in CI secrets.

This script generates two build-time files from the single source of truth
`ci/backend-public.json`:

  * `app/google-services.json` -- the Firebase Android config consumed by the
    `com.google.gms.google-services` Gradle plugin. It MUST faithfully mirror the
    real Firebase project (app id, project number, storage bucket, database URL
    and the Android OAuth client) otherwise FCM token registration fails and
    push notifications / background incoming calls never arrive.
  * `local.properties` -- the Android SDK location plus the Supabase URL/key that
    are injected into `BuildConfig` by `core/network/build.gradle.kts`.

Keep this file byte-for-byte faithful to the Firebase console download so that a
CI build and a local build produce identical, working configuration.
"""
import json
import os
from pathlib import Path

root = Path(__file__).resolve().parents[1]
config = json.loads((root / "ci/backend-public.json").read_text())
v = config["firebase"]

google = {
    "project_info": {
        "project_number": v["gcm_defaultSenderId"],
        "firebase_url": v["firebase_database_url"],
        "project_id": v["project_id"],
        "storage_bucket": v["google_storage_bucket"],
    },
    "client": [
        {
            "client_info": {
                "mobilesdk_app_id": v["google_app_id"],
                "android_client_info": {"package_name": "gagachat.app"},
            },
            "oauth_client": [
                {"client_id": v["oauth_client_id"], "client_type": 3},
            ],
            "api_key": [
                {"current_key": v["google_api_key"]},
            ],
            "services": {
                "appinvite_service": {
                    "other_platform_oauth_client": [
                        {"client_id": v["oauth_client_id"], "client_type": 3},
                    ],
                },
            },
        },
    ],
    "configuration_version": "1",
}
(root / "app/google-services.json").write_text(json.dumps(google, indent=2) + "\n")

android_home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT") or ""
(root / "local.properties").write_text(
    "sdk.dir=" + android_home + "\n"
    + "SUPABASE_URL=" + config["SUPABASE_URL"] + "\n"
    + "SUPABASE_ANON_KEY=" + config["SUPABASE_ANON_KEY"] + "\n"
    + "SUPABASE_STORAGE_BUCKET=chat-media\n"
)
print("Wrote app/google-services.json (app_id=" + v["google_app_id"] + ") and local.properties")
