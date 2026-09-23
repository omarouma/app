# GaGa — Full Re-Audit + Missing Items + Rebuild (native Android APK)

Branch: `feat/attachment-share-screen`

## Section 1 — Re-audit Startup & Auth Flow (Part A)
- [x] Verify no Landing View on native startup (fresh install → Splash → Auth)
- [x] Verify registered user → Splash → Home (no Auth flash)
- [x] Verify logout → Splash → Auth
- [x] Verify Back from Home cannot expose Auth / Landing
- [x] Verify session persistence (Supabase) + auto token refresh
- [x] Verify invalid/revoked session → Auth (fixed: transient network ≠ invalid)
- [x] Verify offline startup → cached Home (added profileCache + fetchUserProfile fallback)
- [x] Verify FCM registration restore + Realtime subscription restore
- [x] GAP: stores not cleared on logout → implemented resetStores() + wired into logout
- [x] GAP: cold-start deep link → added App.getLaunchUrl() handling

## Section 2 — Re-audit Chat Room UI/UX (Part B §33–§76)
- [x] Verify all §33–§76 items still hold after prior pass
- [x] Fix any newly found gaps (none found — prior pass intact)

## Section 3 — Build & Verify
- [x] tsc -b clean
- [x] vite build + cap sync android + strip assets
- [x] gradlew assembleRelease bundleRelease
- [x] Verify APK/AAB + update BUILD_INFO + commit/push
