# GaGa Chat — Google Play publish runbook

Package: `gagachat.app` · Version 2.8.15 (versionCode 70), candidate pending sign-off
Audience: the account owner (Play Console + keystore holder).

This is the end-to-end, console-by-console procedure to take the signed GaGa Chat
build from "not on Play" to a production rollout. It is written so that every
step is either something **this repo already produces** or an action only the
account owner can perform (Play Console login, keystore custody).

> **Key fact that shapes this runbook:** `gagachat.app` currently returns HTTP 404
> on Google Play, i.e. the app is **not yet published**. That means there is **no
> existing Play App Signing identity to conflict with**. A dedicated upload key
> was already adopted in October 2026; do not generate another. Play will use
> its own app-signing certificate on first Play enrollment. (If the
> app were already on Play, an upload-key reset / Play App Signing enrolment
> would be required instead — see §8.)

---

## GaGa 2.8.15 RC1: release gates (2026-10-20)

- Source candidate: PR #139; Android and Compose emulator checks passed on
  commit `9268cf91b6e06c17076663a3c9f1add744144531` before
  signing-guide integration. Re-run CI against the latest commit.
- The ordinary Android repair workflow produced **unsigned APK/AAB artifacts**.
  Development CI success alone does not mean a signed release is available.
- To produce a **signed** build, choose **Actions → Build approved signed
  GaGa candidate → Run workflow**, selecting branch
  `release/gaga-2.8.15-rc1`, *after* installing the approved signing
  secrets in repository Actions settings. The workflow pins the current Play
  upload key fingerprint SHA-256
  `749d2475e3f7999566910df947f43ab91461caad48149d359831465fcfaf03b2`.
- APKs installed from the historical direct-distribution signer cannot
  upgrade in place to an APK signed with the new upload key. **Do not modify
  the live direct-APK update registry or uninstall an existing install before
  exporting unsynced local-only data.** Keep the old-key APK update channel
  separate from the new Play upload AAB.
- After Play enrollment, use the *actual* Play App Signing certificate from
  **Play Console → App integrity** for production Verified Links. The upload
  certificate is not automatically the Play App Signing certificate.
- Never commit a keystore, password or server service-account credential;
  update private GitHub Actions secrets through authorized settings only.

## 0. Prerequisites

| Need | Where it comes from |
| --- | --- |
| Signed AAB (`GaGa-2.8.15-release.aab`) | Built by this repo (see §1) |
| Signed APK (`GaGa-2.8.15-release.apk`) | Built by this repo (see §1) |
| Upload keystore (`gaga-upload.jks`) + passwords | Generated once, held privately (see §2) |
| Play Console account with "GaGa Chat" app | Owner |
| Store listing copy + graphics | `android-native/play/` |
| Data safety answers | `android-native/play/data-safety.md` |
| Content rating answers | `android-native/play/content-rating.md` |
| Privacy policy URL | `https://gagachat.app/privacy.html` (live) |

---

## 1. Produce the signed artifacts

Two signing routes are available. Route A is preferred because it validates the approved certificate and both artifact signatures.

**Route A — GitHub Actions (recommended, reproducible).**
Once the four signing secrets are installed (§2), run
**Actions → Build approved signed GaGa candidate → Run workflow** using branch `release/gaga-2.8.15-rc1`
(`.github/workflows/build-signed-candidate.yml`). It verifies the certificate
against `android-native/ci/release-signing-public.json` **before** compiling,
then uploads a 7-day artifact containing the signed APK and AAB.

**Route B — local build.**
```bash
# Run on a trusted workstation. Do not put signing secrets in the command
# line, shell history, Gradle source, CI logs, or a repository file.
export GAGA_RELEASE_STORE_FILE=/abs/path/gaga-upload.jks
export GAGA_RELEASE_KEY_ALIAS=gaga
# Supply GAGA_RELEASE_STORE_PASSWORD and GAGA_RELEASE_KEY_PASSWORD
# via your private secret manager without printing their values.
cd android-native
./gradlew :app:assembleRelease :app:bundleRelease
```

Outputs land in `app/build/outputs/apk/release/` and
`app/build/outputs/bundle/release/`.

Verify before upload:
```bash
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
jarsigner -verify -verbose -certs app/build/outputs/bundle/release/app-release.aab
```
Confirm the SHA-256 matches the pinned certificate in
`android-native/ci/release-signing-public.json`.

---

## 2. Use the existing, approved upload key

GaGa **already adopted a dedicated Play upload key on 2026-10-19**. Retrieve
the existing `gaga-upload.jks` from its authorized private signing backup.
**Do not generate a new upload key.** Replacing it would introduce a new
certificate and break the release pin.

On a trusted workstation, verify that the private keystore's certificate
matches the expected SHA-256 in
`android-native/ci/release-signing-public.json`. The approved digest begins
`749d2475` and ends `faf03b2`. Never paste the keystore or its password
into a chat, GitHub issue or committed source file.

Install these four GitHub Actions encrypted secrets via the authorized
repository owner's **Settings → Secrets and variables → Actions**:

- `GAGA_RELEASE_KEYSTORE_BASE64`: base64 encoding of the **existing**
  approved `gaga-upload.jks` (stored as a secret)
- `GAGA_RELEASE_STORE_PASSWORD`: existing store password
- `GAGA_RELEASE_KEY_ALIAS`: `gaga`
- `GAGA_RELEASE_KEY_PASSWORD`: existing private-key password

Once configured, launch **Build approved signed GaGa candidate** selecting
the `release/gaga-2.8.15-rc1` ref. That workflow checks the certificate
against the pinned public SHA-256 before building, then independently verifies
both signed APK and AAB. Retrieve only the `GaGa-verified-signed-candidate`
artifact from a successful run.

The old direct-download signer (`dd6b6f…19af13`) is different. Do not
replace the public APK update registry with a new-key build unless the
migration and preservation plan has been tested on existing devices.
---

## 3. Create the app in Play Console

1. Play Console → **All apps → Create app**.
2. App name: **GaGa Chat: Messages & Calls**.
3. Default language: **English (United States)**.
4. App or game: **App**; Free or paid: **Free**.
5. Accept the developer program policies + US export declaration.

---

## 4. Complete "App content" (required before any release)

Fill each item; answers are in the linked files.

| Console item | Answer source |
| --- | --- |
| Privacy policy | `https://gagachat.app/privacy.html` |
| App access | All functionality requires login → provide a **demo account** (email + password) for reviewers, plus the steps to reach a chat/call |
| Ads | **No ads** |
| Content rating | `android-native/play/content-rating.md` |
| Target audience | **13+** (not designed for children) |
| News app | No |
| Data safety | `android-native/play/data-safety.md` |
| Government app | No |
| Financial features | **None** (wallet is a preview; no real money) |
| Health | No |

Create the reviewer demo account in the live backend and paste its credentials
into **App access**. Reviewers must be able to sign in and send a message.

---

## 5. Store listing

Play Console → **Grow → Store presence → Main store listing**. Use the copy in
`android-native/play/store-listing.md` and the graphics in `android-native/play/`:

- App icon `icon-512.png` (512×512)
- Feature graphic `feature-graphic-1024x500.png`
- Phone screenshots — capture from the **release build** (see
  `android-native/play/screenshots/README.md`; use
  `android-native/ci/capture_store_screenshots.sh` +
  `android-native/play/frame_screenshots.py` for 1080×1920 / 9:16)

Categorisation: **Communication**; tags Messaging, Calling, Chat.
Contact: support@gagachat.app · https://gagachat.app.

---

## 6. Internal testing (first upload)

1. Play Console → **Testing → Internal testing → Create new release**.
2. Upload `GaGa-2.8.15-release.aab`.
3. Accept **Play App Signing** (Play generates the app-signing key; keep the
   upload key safe).
4. Add release notes (from `store-listing.md`, "What's new").
5. Add internal testers (email list) and roll out.
6. Install from the internal-testing opt-in link on at least **two physical
   devices**, sign in with two accounts, and verify:
   - 1:1 message send/receive, delivery/read receipts
   - 1:1 voice and video call connect + reconnect
   - push notification and incoming-call alert
   - photo / document / voice-note send
   - live location send
   - account deletion path
7. Watch **Play Console → Quality → Android vitals** for crashes/ANRs.

---

## 7. Closed → Open → Production

1. **Closed testing**: promote the same AAB, add a wider tester list, run for at
   least the minimum period, then review pre-launch report.
2. **Production**: **Production → Create new release →** add the AAB →
   **Staged rollout** (start at 5–10%) → review → increase to 100%.
3. Fill the **release notes** and confirm the countries list.

---

## 8. If the app were already on Play (not the case today)

An app already enrolled in Play App Signing cannot be re-signed with an arbitrary
new key. You would either (a) keep using the existing upload key, or (b) request
an **upload-key reset** in Play Console (App integrity → App signing) and upload
the new key's certificate. This runbook's fresh-key path applies **only** because
`gagachat.app` is not yet published.

---

## 9. Post-publish

- Update `hosting/public/app-updates/android.json` so the `channels.play`
  `versionCode` matches the live Play release (it is `0` until then).
- Keep the GitHub Releases mirror (`android-2.8.15` / `bundle-2.8.15`) in sync.
- Rotate the exposed `oumagachat` service-account key (see
  `android-native/docs/FIREBASE_PUBLIC_CONFIG_AND_ADMIN_ROTATION.md`).

---

## 10. What is blocked on the owner

Everything in §2 (keystore custody + GitHub secrets) and §3–§8 (Play Console
login) requires the account owner. The repo side — signed-artifact build, store
listing, data-safety, content-rating, drift check — is complete.
