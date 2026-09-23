# GaGa — Fix native notification responsiveness (bug fix)

Branch: `feat/attachment-share-screen`
North-star: GaGa must be BETTER than WhatsApp/Messenger (see NORTH_STAR.md).

## Section 1 — Diagnose
- [x] Reproduce: sounds play but no OS notification appears / taps do nothing on native
- [x] Root cause A: `pushNotificationService` is SW-based → no-op on native → `canSend()` always false
- [x] Root cause B: no local-notifications plugin → JS cannot display notifications on native
- [x] Root cause C: FCM tap listener only attached after login → cold-start taps lost
- [x] Root cause D: channels `gaga_calls`/`gaga_messages` never created
- [x] Root cause E: call tap only navigates to /calls, never rings

## Section 2 — Implement
- [x] Install `@capacitor/local-notifications`
- [x] Create `src/lib/notificationRouter.ts` (tap → nav, cold-start queue)
- [x] Create `src/services/nativeNotifications.ts` (channels, show, cancel, action listener)
- [x] `navigation.ts`: flush pending notification nav on registerNavigate
- [x] `nativePush.ts`: attach listeners early; route taps via router; foreground call push
- [x] `usePushNotifications.ts`: init native notifications + early listeners
- [x] `useMessageNotifications.ts`: native OS notification path
- [x] `useIncomingCallNotifications.ts`: native call notification path
- [x] `useForegroundNotifications.ts`: native path
- [x] `App.tsx`: init native notifications at startup
- [x] AndroidManifest: USE_FULL_SCREEN_INTENT for calls
- [x] tsc -b clean

## Section 3 — Build & release
- [ ] Clean build (tsc -> vite -> cap sync -> strip -> gradle)
- [ ] Verify APK/AAB signatures (v1/v2/v3)
- [ ] Copy to deliverables + checksums + BUILD_INFO
- [ ] Commit + push to GitHub
