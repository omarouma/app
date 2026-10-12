"""Fail-fast GaGa Firebase production Android client configuration audit.

This script verifies the generated PUBLIC google-services.json against the
checked-in, non-secret backend configuration. It NEVER reads or imports an
Admin SDK service-account private key. Successful checks do not prove that
Firebase Auth/FCM/Crashlytics or security rules are deployed and working.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parent
EXPECTED_FIREBASE_PROJECT = "oumagachat"
EXPECTED_PACKAGE = "gagachat.app"


def verify() -> dict[str, str]:
    public = json.loads((ROOT / "ci/backend-public.json").read_text(encoding="utf-8"))
    expected = public["firebase"]
    actual = json.loads((ROOT / "app/google-services.json").read_text(encoding="utf-8"))

    project = actual.get("project_info", {})
    identity_fields = {
        "project_id": "project_id",
        "project_number": "gcm_defaultSenderId",
        "firebase_url": "firebase_database_url",
        "storage_bucket": "google_storage_bucket",
    }
    for firebase_key, public_key in identity_fields.items():
        assert project.get(firebase_key) == expected[public_key], (
            f"Firebase configuration mismatch: {firebase_key}"
        )
    assert project["project_id"] == EXPECTED_FIREBASE_PROJECT
    assert expected["project_id"] == EXPECTED_FIREBASE_PROJECT
    assert re.fullmatch(r"1:[0-9]+:android:[0-9a-f]+", expected["google_app_id"])

    clients = [
        c for c in actual.get("client", [])
        if c.get("client_info", {}).get("android_client_info", {}).get("package_name")
        == EXPECTED_PACKAGE
    ]
    assert len(clients) == 1, "Expected exactly one release Android package configuration"
    release_client = clients[0]
    assert release_client["client_info"]["mobilesdk_app_id"] == expected["google_app_id"]
    assert any(x.get("current_key") == expected["google_api_key"]
               for x in release_client.get("api_key", []))
    assert any(x.get("client_type") == 3
               and x.get("client_id") == expected["oauth_client_id"]
               for x in release_client.get("oauth_client", []))

    app_gradle = (ROOT / "app/build.gradle.kts").read_text(encoding="utf-8")
    assert f'applicationId = "{EXPECTED_PACKAGE}"' in app_gradle
    assert 'pluginManager.apply("com.google.gms.google-services")' in app_gradle
    assert 'pluginManager.apply("com.google.firebase.crashlytics")' in app_gradle
    assert 'implementation(libs.firebase.messaging)' in app_gradle
    manifest = (ROOT / "app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")
    assert ".push.GagaFirebaseMessagingService" in manifest

    assert (REPO_ROOT / ".firebaserc").exists(), "Missing Firebase project mapping"
    assert json.loads((REPO_ROOT / ".firebaserc").read_text())["projects"]["default"] == EXPECTED_FIREBASE_PROJECT
    assert json.loads((REPO_ROOT / "firebase.json").read_text())["hosting"]["site"] == EXPECTED_FIREBASE_PROJECT
    assert not (ROOT / "app/firebase-adminsdk.json").exists(), (
        "Private Admin SDK JSON must NEVER be bundled with the client"
    )
    assert "private_key" not in json.dumps(actual)
    assert "service_account" not in json.dumps(actual)

    return {
        "firebase_project": EXPECTED_FIREBASE_PROJECT,
        "android_package": EXPECTED_PACKAGE,
        "firebase_app_id": expected["google_app_id"],
        "status": "PUBLIC_CLIENT_CONFIG_VALIDATED",
        "limitations": "Not a live Firebase/Firebase Rules/FCM delivery test",
    }


if __name__ == "__main__":
    # Deliberately do not print Android client API keys or OAuth credentials.
    result = verify()
    print(f"GaGa Firebase: {result['status']} "
          f"(project={result['firebase_project']}, package={result['android_package']}).")
    print("Live Firebase and FCM functional verification remain required.")
