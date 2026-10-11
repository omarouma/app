# GaGa 2.7.3 — Screenshot-grounded frontend refinement and QA
**Baseline:** `android-2.7.3` tag; branch `feat/gaga-2.7.3-frontend-polish`.
**Evidence:** Ten user-provided Android screenshots (Chats, Notifications, Settings x2, Me x2, Today, chat background, Chat Info, message action sheet) plus native Kotlin source. The screenshot APK's SHA-256 differs from the GitHub release asset while its v1 signing certificate matches the GitHub release certificate; don't assume binary equivalence.

## Implemented source corrections

| ID | Screen | User-visible correction | Kotlin path |
|---|---|---|---|
| UXP-01 | Today | Replace clipped horizontal Add toolbar with full-width responsive two-column quick-add actions, 48dp minimum buttons | `feature/dailylife/DailyLifeScreen.kt` |
| UXP-02 | Today | Make four summary stats two-column at small widths/large fonts; shorten marketing-heavy heading | `feature/dailylife/DailyLifeScreen.kt` |
| UXP-03 | Chats | Tighten large conversation rows, size avatar consistently, handle blank-but-not-null last-message preview | `feature/home/ConversationRow.kt` |
| UXP-04 | Settings | Neutralize overwhelming saturated green icons; hide planned Business/Premium/Delivery sections behind an explicit reveal action | `feature/settings/SettingsScreen.kt` |
| UXP-05 | Me | Top-level Me must not display a misleading Back arrow; suppress self last-seen entry in contact info | `feature/profile/ProfileScreen.kt` |
| UXP-06 | Chat Info | Resolve private storage URLs for shared gallery thumbnails, show useful loading/placeholder labels, show all image rows, open image/video via existing full-screen media viewer | `feature/chat/ChatInfoScreen.kt`, `feature/chat/ChatInfoViewModel.kt` |
| UXP-07 | Chat actions | Compact and scrollable bottom sheet; show essential actions by default, expose advanced GaGa tools on demand; remove duplicated React action (reactions remain accessible) | `feature/chat/ChatScreen.kt` |
| UXP-08 | Notifications | All/Unread/Calls/People/Chats filters and clearer all-read labeling; retain real event rows rather than silently hiding or auto-marking events | `feature/settings/NotificationInboxScreen.kt` |

## Visual system to apply across the full app

- Maintain existing branded green (#007B15) for active/selected state and primary actions, not every decorative icon. Neutral on-surface icons in Settings, contacts and action menus; red reserved for destructive operations, yellow/amber for caution.
- Shared size tokens: 16dp content inset, 8/12/16dp spacing rhythm, minimum 48x48dp actionable hit area, two-line compact chat rows (~68-80dp), 44-48dp avatars in dense lists, 56dp top app bar plus correct system insets.
- Design system in `core/ui/theme/{Color,Type,Dimens,Shape,Theme}.kt` and `core/ui/component/{GagaTopAppBar,ListItems,Buttons,StateViews}.kt`. Avoid per-screen hardcoded saturated colors and direct full-screen overlays without insets.
- Text: readable secondary labels, not unlabeled 11sp light-gray status text. Respect system font scale, TalkBack semantics, light/dark and contrast.
- Bottom bar: five primary destinations Chats, People, Calls, Today, Me; keep selected indicator and meaningful badges; no back arrow on a primary tab. Inner screens own Back.
- Sounds/haptics: explicitly test per-category message, incoming/outgoing call, call answered/ended, friend request, error and recording sounds. Each must honor notification channel, silent/vibrate, focus/Do Not Disturb and user settings. Never play redundant alerts for duplicate FCM and in-app events.

## Outstanding visual/functional gaps (NOT marked fixed by the source patch)

| Priority | Scope | Requirement |
|---|---|---|
| P0 | Media | Test thumbnail signing on live backend, upload/send/retry on poor networks; show bounded retry/error state instead of spinning forever. Ensure video thumbnails use a generated image when possible. |
| P0 | Navigation | Test all links, internal routes and Android App Links; original APK signing continuity and hosted assetlinks remain release gates. |
| P0 | Privacy | Verify blocked-user and profile-visibility RLS; privacy badges must reflect actual saved preference state. |
| P0 | Wallet | Don't advertise working real-money withdrawals/exchange without approved live banking rails and compliance. |
| P1 | Notifications | Group consecutive same-peer call notifications behind an expand control **only if** unread/read semantics and timestamps remain accurate. Consider separating activity tabs and call history. |
| P1 | Chat background | Add a miniature live message preview, selected style, System/solid wallpaper options, and clear per-chat vs global scope. |
| P1 | Chat Info | Open actual file/link content with validated URLs and appropriate MIME safety; add tabs/gallery pagination for large histories; files must be clickable where intended. |
| P1 | Profile | Reduce visual competition among cover/video/avatar/actions/stats/completeness; self email/phone visibility must be account-only; keep actual verification separate from design-only badges. |
| P1 | Calls | Validate ringtone/recording/connecting/active/error states, lock-screen incoming call buttons, audio routing and return-to-chat. |
| P1 | People & QR | Test camera + photo QR scan and actual friend request states, with clear user confirmation. Cross-device Favorites requires backend migration. |
| P1 | Today | De-duplicate repeat missed callers; prioritize real action-required items and hide optional empty modules. |
| P2 | Settings | Search should index supported functions; avoid placeholder controls that promise a working service. Add clear data/access/privacy support screens. |
| P2 | Onboarding | Explain camera/mic notifications at moment of use; do not claim address book matching unless a working consented feature exists. |

## Release acceptance checklist

1. GitHub Actions compiles and tests source changes against current release branch; no hardcoded service keys or changes to signing identity.
2. Fresh screenshots from **this exact built commit** on small Android (320dp), typical Android (360–430dp), large device and both light/dark modes; no clipped Today buttons, no chat blank previews for successfully downloaded photos.
3. Test 1.0x, 1.3x, 1.6x and 2.0x text scales; TalkBack touch targets at least 48dp; keyboard open/close and IME navigation; screen reader reads unread notification badges.
4. On two signed-in accounts: chat text/media/voice, image previews, call incoming/outgoing, accept/reject, background/locked screen, QR, friends, block, notifications, Today tasks and wallet-safe gating.
5. Spot-check all hyperlinks, app links, Settings routes, chat menu actions and no-op actions. Verify no "success" UI when backend write fails.
6. Match APK/AAB signing fingerprint against accepted Play App Signing setup. The current uploaded 2.7.3 fingerprint alone does not prove update continuity with 2.7.2.
7. Stage and validate missing production Supabase friend/favorites/push migrations and least-privilege RLS before production activation.
8. Generate signed AAB and conduct Google Play internal track prelaunch; don't label publish-ready until this, permission disclosures and moderation work pass.
