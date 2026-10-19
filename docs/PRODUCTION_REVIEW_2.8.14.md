# GaGa Chat — whole-app production review (2.8.14)

**Baseline:** `omarouma/app` @ `b49395f`, package `gagachat.app`, version
**2.8.14 / versionCode 69** (compileSdk 36, targetSdk 36, minSdk 26).
**Method:** static review of the native Android project (29 Gradle modules, 419
Kotlin files), the Supabase backend (10 Edge Functions, 64 migrations), the
release/qualification documents, and the real emulator renders produced by the
`GaGa native redesign visual checks` CI run (artifact
`GaGa-native-redesign-visual-checks`). No physical device or Play Console access
was available in this environment.

This report records the state of the app, the concrete defects found and fixed,
and the blockers that remain outside the reach of a code-only review.

---

## 1. Verdict

The app is **feature-complete and internally consistent** for its current
release line. It is a local-first native client (Room cache + outbox + optimistic
messaging) on top of Supabase and Firebase, with LiveKit for calling. The 2.8
redesign is applied through shared components, so the primary surfaces render
with a single green design system.

It is **not yet a "publish to everyone today" candidate**, but the remaining gaps
are *operational* (device QA, Play Console, migration drift), not missing
features. The store-listing assets that were genuinely missing have been added in
this pass.

## 2. Frontend review

### 2.1 Shared shell
`GagaScaffold` / `GagaTopAppBar` drive consistent headers, insets and navigation
across all routes; `GagaDimens` centralises spacing and touch-target sizes.
`MainNavHost` hosts five bottom tabs (Chats, People, Calls, Today, Me) and every
feature graph via extension functions. No double status-bar padding was found in
the reviewed screens.

### 2.2 Chats home (conversation list) — `HomeScreen` / `ConversationRow`
- Search bar, four filter chips (All / Unread / Pinned / Groups) with live counts,
  pinned/recent sectioning, pull-to-refresh, and a create menu (new chat, new
  group, my QR).
- Row supports tap, long-press context menu (pin, mute, mark read, delete) and a
  swipe-to-delete that routes through the same confirmation dialog — a swipe
  never deletes on its own.
- **Fixed:** a `Spacer(Modifier.width(...))` sat between the title and the message
  preview inside a `Column`, so it added horizontal width and **no vertical gap**
  (a no-op). Changed to `Modifier.height(...)` so the two lines are no longer
  touching.

### 2.3 Chat room — `ChatScreen` (1,531 lines) + components
The richest surface: paginated history, date separators, unread divider,
scroll-to-bottom, message search, reply/react/forward/delete action sheet,
reactions, typing indicator, link previews, media viewer, view-once photos, photo
editor, voice notes, location cards with an in-app tiled map, polls, scheduled
messages, split-bill and translate dialogs, and an attachment browser. The
composer is a compact, tag-instrumented control row that the instrumented tests
assert stays within 60 dp. This is well beyond a typical chat MVP.

### 2.4 Calls — `ActiveCallScreen` (935 lines), `CallHistoryScreen`
LiveKit-based full-screen call surface with remote video, local preview, live
duration, mute / speaker / Bluetooth / camera / flip / PiP controls, permission
gating (camera for video, mic for any call), retry, and a picture-in-picture
controller. Incoming and outgoing calls share the machinery. Call history has
filters and empty/error states. **Audio/video routing still needs a physical
device** (see §7).

### 2.5 Profile / Me — `ProfileScreen` (1,220 lines)
Cover image, avatar, name, verification and PRO badges, action group (edit /
privacy / share), profile-completeness card, privacy summary and more. Issue #133
flags a "competing hero" at large text; the render confirms the hierarchy is tall
at 2× text. **Fixed:** the display name was squeezed against the verified/PRO
badges and truncated to an ellipsis; it now uses a `FlowRow` so a long name
claims the full width and the badges wrap to their own centred line, preserving
the identity. The hero is still tall at 2× text — a further cosmetic refinement
remains (§8).

### 2.6 Settings — `SettingsScreen` + `SettingsSubScreens`
Data-driven hub of 30 categories in five groups, with search, an account block,
and destructive actions pinned at the bottom. Crucially, the three unimplemented
features (Business, Premium, Delivery) are grouped under a **"Coming soon"**
section behind an explicit badge and a show/hide toggle — they are not dead
toggles. The privacy/consumer toggles are wired through to the server-side policy
(2.7.1+), so the "honest settings" requirement in #133 is largely satisfied.

### 2.7 Other surfaces
Today (`DailyLifeScreen`) has a greeting/date hero, a "Today's focus" summary
card, a needs-reply card, a quick-action strip, an agenda, and workspace / search
/ empty / error / loading states. **Fixed:** the quick-action strip used a
horizontally scrolling `Row` that clipped the fifth action ("Shared lists") at
360 dp; it is now a responsive `FlowRow`, so every action stays fully visible and
tappable at 320 dp and at large text scales. People /
Contacts / Discover, QR, Groups, Wallet (with explicit live / read-only /
watch-only labels), China Direct, and Authentication/Onboarding are all present
and themed. `GagaStrings` provides a typed, completeness-tested i18n table for
English / Bengali / Chinese covering navigation and settings chrome.

## 3. Backend review

- **10 Edge Functions:** `chain-wallet`, `create-call`, `delete-account-secure`,
  `firebase-token`, `friend-event-push`, `link-preview`, `livekit-token`,
  `send-fcm-push`, `translate-message`, `view-once-photo`. Secrets are read from
  the function environment; no key material is committed.
- **Calling:** `livekit-token` authenticates the caller, verifies call membership
  and mints a short-lived room-scoped LiveKit JWT, so the LiveKit API secret never
  ships in the APK. `create-call` and the call-lifecycle RPCs drive signalling.
- **Push:** `send-fcm-push` (HTTP v1, service-account OAuth) and `firebase-token`
  (custom sign-in token) are the two functions that were broken and are now
  repaired — see §6.
- **Migrations:** 64 in the repo. The live project is reported to hold **106**
  (issues #93 / #95) — a **history-drift risk** that must be reconciled before any
  further database deployment. See §7.

## 4. Security & privacy

- RLS is enabled across user-scoped tables; the recent
  `gaga_messaging_rls_auth_cache` migration caches `auth.uid()` to reduce
  per-row auth calls.
- **79 `SECURITY DEFINER` occurrences across 36 migration files** — these
  privileged functions deserve a focused audit to confirm each pins `search_path`
  and re-checks ownership. Recorded as a follow-up, not a blocker.
- **Password-breach protection is off** in the auth settings (a production
  hardening item).
- ~120 "auth in RLS" performance advisories are tracked; they are performance,
  not correctness, warnings.
- The app declares no `REQUEST_INSTALL_PACKAGES` (correctly removed for Play
  policy) and uses a `FileProvider` for shared files.

## 5. Google Play readiness

| Requirement | Status |
| --- | --- |
| Signed release build (AAB/APK) | ✅ approved certificate; CI verifies the pinned SHA-256 |
| App icon 512×512 | ✅ regenerated to match the green launcher icon (was purple) |
| Feature graphic 1024×500 | ✅ added |
| Phone screenshots (2–8) | ⏳ capture from the release build (`play/screenshots/`) |
| Short / full description, release notes | ✅ `play/store-listing.md` |
| Privacy policy / terms URLs | ✅ `gagachat.app/privacy.html`, `/terms.html` |
| Data safety form | ⏳ complete in-console |
| Content rating | ⏳ complete in-console |
| Target SDK compliance | ✅ targetSdk 36 |

The listing kit lives in `android-native/play/`. See its `README.md` for the
checklist and `screenshots/README.md` for the capture procedure.

## 6. Fixed in this pass

1. **Chats list row** — no-op vertical spacer corrected (`ConversationRow`).
2. **Play icon** — replaced the mismatched purple icon with a 512×512 icon
   generated from the real launcher assets (`play/make_icon.py`).
3. **Feature graphic** — added `play/feature-graphic-1024x500.png`.
4. **Store listing copy** — added `play/store-listing.md` (name, short/full
   description, release notes, categorisation).
5. **Screenshots tooling** — added `ci/capture_store_screenshots.sh` and
   `play/screenshots/README.md`.
6. **Doc drift** — corrected the version (2.7.2/47 → 2.8.14/69) and target SDK
   (35 → 36) in the root and module READMEs; added a 2.8.x CHANGELOG entry.
7. **GaGa Today quick actions** — the horizontally scrolling strip that clipped
   the fifth action at 360 dp is now a responsive `FlowRow` (`DailyLifeScreen`).
8. **Profile header name** — a long display name no longer truncates against the
   verified/PRO badges; the badges wrap to their own line (`ProfileScreen`).
9. **Firebase/FCM credentials** (previous pass, PR #132) — the six Edge Function
   secrets were rotated and both previously blocked backend checks now pass.

## 7. Residual blockers (outside a code-only review)

These cannot be closed from this environment and are the real gate to a public
rollout:

- **Physical-device QA.** Real FCM push delivery, OEM background behaviour,
  incoming/active call audio and routing, lock-screen and battery-management
  behaviour, camera/QR, and data-preserving upgrade over an existing install are
  all unverified without a device.
- **Google Play Console.** Publication needs console access, the Data safety and
  content-rating forms, and the internal-testing track — none of which are
  reachable here.
- **Migration drift (#93 / #95).** Reconcile the 64 repo migrations against the
  106 live ones before the next database deployment.
- **Credential hygiene.** The `oumagachat` service-account key was transmitted
  through chat to perform the repair; rotate it again from Google Cloud IAM and
  revoke the exposed key ID after cutover.
- **Open security hardening.** Enable password-breach protection; audit the
  `SECURITY DEFINER` functions.

## 8. Recommended next steps

1. Capture the store screenshots from the release build and complete the Play
   Console forms (Data safety, content rating), then run an internal test.
2. Run the device-QA checklist from `docs/RELEASE_2.8.14_AUDIT.md` on at least one
   low-end and one modern device.
3. Reconcile the migration history (#93 / #95).
4. Rotate the exposed service-account key and enable password-breach protection.
5. Optional polish from issue #133: tighten the profile hero height at large
   text (the name/badge wrapping is already fixed) and review the remaining P0/P1
   items (shared-shell insets, notifications taxonomy, chatroom large-text pass).
