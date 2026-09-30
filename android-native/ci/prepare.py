"""Prepare public app configuration; private signing material stays in CI secrets."""
import json, os
from pathlib import Path
root = Path(__file__).resolve().parents[1]
config = json.loads((root / "ci/backend-public.json").read_text())
v = config["firebase"]
google = {
    "project_info": {"project_number": v["gcm_defaultSenderId"], "project_id": v["project_id"], "storage_bucket": v["google_storage_bucket"]},
    "client": [{"client_info": {"mobilesdk_app_id": v["google_app_id"], "android_client_info": {"package_name": "gagachat.app"}}, "api_key": [{"current_key": v["google_api_key"]}]}],
    "configuration_version": "1",
}
(root / "app/google-services.json").write_text(json.dumps(google))
(root / "local.properties").write_text(
    "sdk.dir=" + os.environ["ANDROID_HOME"] + "\n"
    + "SUPABASE_URL=" + config["SUPABASE_URL"] + "\n"
    + "SUPABASE_ANON_KEY=" + config["SUPABASE_ANON_KEY"] + "\n"
    + "SUPABASE_STORAGE_BUCKET=chat-media\n"
)
