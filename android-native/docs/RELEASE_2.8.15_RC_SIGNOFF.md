# GaGa 2.8.15 RC — release sign-off and physical-device checklist

**Status:** Candidate source only; **not released or signed as of the last
observed build**. Branch `release/gaga-2.8.15-rc1` · PR #139.
Package: `gagachat.app` · version `2.8.15` · versionCode `70`.

## 1. Automated qualification

- [x] Prior integrated commit `9268cf9` Android repair workflow passed:
  https://github.com/omarouma/app/actions/runs/39345379101
- [x] Prior integrated commit `9268cf9` visual emulator workflow passed:
  https://github.com/omarouma/app/actions/runs/39345379261
- [x] Artifacts downloaded and inspected: compilation produced unsigned
  compact APK, release APK and AAB. CI wrote `SIGNING-REQUIRED.txt`.
- [ ] Re-run BOTH CI workflows and verify results against the **latest PR head**
  after Play readiness and documentation integration.
- [ ] Obtain a real signed APK/AAB from `.github/workflows/build-signed-candidate.yml`.
  In Actions select `release/gaga-2.8.15-rc1`, *not* main.
- [ ] Verify the signed APK with `apksigner verify --verbose --print-certs` and
  AAB with `jarsigner -verify`; confirm expected upload SHA-256 fingerprint
  `749d2475e3f7999566910df947f43ab91461caad48149d359831465fcfaf03b2`.
- [ ] Verify `gagachat.app`, `versionCode=70`, `versionName=2.8.15`,
  archive hashes and ZIP alignment on the exact signed output.

## 2. Signing compatibility, secrets and publication

- [ ] Authorized owner runs the offline `configure_signing_secrets.py` with
  `--base64-file /secure/path/GAGA_RELEASE_KEYSTORE_BASE64.txt --verify-only`
  to confirm approved upload key SHA-256; private store password stays local.
- [ ] Only on successful verification, run the same tool with `--configure`
  using locally authenticated GitHub CLI to set four encrypted repository
  Actions secrets. No Base64 or password may be committed or logged.
- [ ] Keep historical old-key direct-download APK registry untouched.
  A new-key APK **cannot** upgrade an old-key sideload install in place.
- [ ] Take a tested backup/export of any unsynced locally stored messages and
  drafts before any uninstall. Never describe uninstall as lossless.
- [ ] Audit proposed Verified Links `assetlinks.json` against the actual Play
  app-signing certificate from Play Console App Integrity. Do not assume the
  upload certificate is the device installation certificate.
- [ ] Complete Play Data safety, app access reviewer test account, content
  rating and internal test rollout; Play publishing is a separate owner action.

## 3. Real-device acceptance — at least two Android phones

- [ ] Fresh install signed build; cold start and login/signup/logout without crash.
- [ ] Data-preserving same-signer upgrade over an installed predecessor; verify
  Room messages, unsynced drafts, account switch and device state.
- [ ] Direct/group message send, receive and receipts in foreground, background,
  killed process, offline reconnect, and two-account scenarios.
- [ ] Muted chat is silent; separate group/direct sound toggles, custom
  Android system channel tones, vibration, DND and notification previews work.
- [ ] Incoming/ongoing/missed calls on locked and unlocked phones; ringtone,
  microphone mute, speaker, Bluetooth wired/Bluetooth headset and cleanup.
- [ ] Media action sheet: 320/360/412dp, 1× and large font, dark/light,
  Send to chat, Favorite, Open, Save, Share, Edit, Locate, All media,
  Extract/Translate; no action should fire until chosen.
- [ ] Viewer image pinch/zoom and video pause/exit; media save/export
  permissions; view-once privacy on locked screens.
- [ ] Today, Chats, People/QR, Calls, Profile, Settings, Wallet and China Direct
  visual and interaction smoke tests. China Direct checkout stays
  intentionally unavailable without verified supplier/landed cost.

## 4. Operational scope

- This candidate does not deliver every requested advanced notification feature:
  secure inline quick-reply, timed mute, mentions-only, contact-specific sounds,
  school/business alerts, and focus schedules remain under issue #135.
- Live Firebase/FCM service-token preflight has passed according to the
  2.8.14 qualification report, but physical push and voice-call delivery is
  **not** established by a dry run.
- Reconcile live Supabase schema/migration history before pushing schema changes.
- Do not merge to `main`, change the update registry or declare production
  ready until all blocking items above have evidence.
