# GaGa 2.7.3 — QR Code + People improvement source pack

**Branch:** `feat/gaga-qr-people-professional-2.7.3`
**Parent:** `feat/gaga-professional-chats-2.7.3` (chat UI PR #60); that parent includes Play/API36 repair PR #59.

## Verified defects addressed

- **My QR:** Profile/Transfer/Group/Wallet tabs previously all generated the same **profile** QR, wrongly suggesting payment and group-join capabilities. The new QR shows *only* real profile sharing with no wallet balance or fake currency display.
- **QR link identity:** Profile QR now uses `https://gagachat.app/profile/<user UUID>`, consistent with Add Friends and the existing Android HTTPS deep-link router.
- **Legacy QR support:** The scan parser also accepts existing `gaga://user/<UUID>`, `gagachat://profile/<UUID>`, bare UUID and validated `@username` input.
- **Validation:** Reject arbitrary URLs, email addresses and random text as user IDs; no automatic external navigation or payment action occurs on scan.
- **Scan result:** Distinguish invalid code, self-scan, no matching user and lookup/connection error. A user must review identity before confirming a friend request.
- **Request states:** Recognize friend, outgoing pending request or incoming request; disable duplicate requests and permit accepting an incoming request. Provide a View Profile route.
- **CameraX:** Dispatch scan result once on the main executor, rather than repeatedly invoking navigation from analyzer threads.
- **People:** Direct Scan QR entry, live Received/Sent request counts, favorites-first sorting, protected actions during mutation and friend discovery shortcut.
- **Add Friends:** Remove misleading Suggestions/Nearby tabs and fake Upload QR Image control pending real services; actual search and request list remain.
- **Friend request UI:** Sync Sent status from the repository, guard repeated taps and display backend errors in the screen instead of silently swallowing failures.

## Files to copy into matching parent source

- `android-native/feature/qr/src/main/kotlin/app/gagachat/feature/qr/MyQrViewModel.kt`
- `android-native/feature/qr/src/main/kotlin/app/gagachat/feature/qr/MyQrScreen.kt`
- `android-native/feature/qr/src/main/kotlin/app/gagachat/feature/qr/AddByCodeViewModel.kt`
- `android-native/feature/qr/src/main/kotlin/app/gagachat/feature/qr/AddByCodeScreen.kt`
- `android-native/feature/qr/src/main/kotlin/app/gagachat/feature/qr/QrCameraScanner.kt`
- `android-native/feature/qr/src/main/kotlin/app/gagachat/feature/qr/QrNavigation.kt`
- `android-native/feature/qr/src/test/kotlin/app/gagachat/feature/qr/QrPayloadTest.kt`
- `android-native/feature/qr/build.gradle.kts`
- `android-native/feature/people/src/main/kotlin/app/gagachat/feature/people/PeopleScreen.kt`
- `android-native/feature/people/src/main/kotlin/app/gagachat/feature/people/PeopleViewModel.kt`
- `android-native/feature/people/src/main/kotlin/app/gagachat/feature/people/PeopleNavigation.kt`
- `android-native/feature/people/src/main/kotlin/app/gagachat/feature/people/DiscoverScreen.kt`
- `android-native/feature/people/src/main/kotlin/app/gagachat/feature/people/DiscoverViewModel.kt`
- `android-native/app/src/main/kotlin/app/gagachat/navigation/MainNavHost.kt`

## Build/test locally

Open the project root `android-native/` in Android Studio (JDK 17, Android SDK API 36), configure the existing Firebase public client files and secure backend config per the repository guide, then run:

```bash
./gradlew :feature:qr:testReleaseUnitTest :app:assembleRelease :app:bundleRelease
```

For direct terminal use in GitHub Actions, follow `.github/workflows/android-repair.yml`; the current keyless CI typically produces unsigned artifacts. A *signed* release still requires the **same original matching keystore** as the installed GaGa 2.7.2 releases. The QR source ZIP is **not** an APK.

## Manual acceptance tests

1. Open **People** → Scan QR, grant or deny camera, confirm manual entry still works.
2. Open **My QR**, display QR on phone A and scan it on phone B. Correct profile must resolve, never trigger a payment or join a Circle.
3. Scan legacy `gaga://user/<UUID>` and new https code; both find the same user.
4. Scan random/foreign QR code, malformed ID, email, own QR; show safe explanatory error.
5. View profile from scanned identity, send *one* request, verify outgoing pending status on both Add By Code and People screens.
6. While request pending, scan same user again: no duplicate Add button.
7. On recipient phone, open People → Requests → Accept; both accounts then see friendship and are able to open a permitted chat.
8. Scan a user who has already sent a request: **Accept Friend Request** displayed instead of duplicate Add.
9. Accept, decline, cancel and unblock while offline; show real errors, never a fake success.
10. Reopen Add Friends; Sent/Received counts and request statuses match backend.
11. Test 200% font scale, keyboard focus, TalkBack, Android 8–16, no-camera device and dark mode.
12. Confirm the hosted website `/profile/<UUID>` supports verified Android App Links with the *actual* distribution signing certificate. Repository JSON changes do not establish deployment.

## Deferred separately (not falsely shown as working)

- Nearby people discovery: requires opt-in consent, expiry, obfuscated distance and anti-abuse protections.
- Friend recommendations: requires server-supported privacy-safe suggestion data.
- Favorites cross-device sync: currently device/account-local; add server persistence separately.
- **Gallery QR import:** scanner is CameraX/manual-entry only; no claim of image-file scanning is made.
- Transfer, group-join and Wallet QR: require entirely separate signed/authorized payload formats and confirmation; never use profile QR to authorize funds movement.
- Profile discovery privacy and block/RLS enforcement must be validated with two real accounts against production Supabase; source changes alone do not prove it.
