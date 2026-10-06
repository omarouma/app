# GaGa 2.0.32 review

Application ID: `gagachat.app`; versionCode 34. This review builds on the Daily Life release without replacing existing user tables or data.

## Implemented in this pass

- People: real, account-scoped device-local favorites; visible empty tabs; friend-action failure feedback; confirmation before removing a friend; compact navigation menu.
- Saved messages: search, refresh, open the original conversation, and server-confirmed deletion with actionable error feedback.
- Notifications: unread filter, refresh, safe internal destinations, single bulk mark-read request, and retained unread state when the server fails. Account changes clear notification/friend caches and late responses cannot restore another account's notification/friend data.
- Chats: first-load feedback, manual refresh, and server-confirmed deletion. Confirmation explicitly describes the existing shared conversation deletion semantics.
- Calls: account-scoped local history removal survives refresh without deleting the other participant’s history; accurate incoming-missed filtering, clearer outcome labels, compact action menu, refresh, and confirmation/error feedback for history removal.
- Persistence: record edits and deletions reject empty server acknowledgements; retrying a creation cannot silently accept different previously saved values.
- Daily Life: quick expense/income/reminder entry, responsive dashboard, monthly filters and pending/completed reminder filters. Totals are grouped by currency; these are recorded amounts, not bank balances.
- Shopping: owner rename/delete; item edit/remove; shared deletion confirmations; visible search failures; stable list display during lifecycle-aware polling; progress count.
- Layout: adaptive attachment grid, larger profile action touch targets, wrapping labels, theme-aware action contrast, and no decorative avatar on unrelated toolbar subtitles.

## Verification

CI must compile the release APK/AAB and run model, data, network and call tests plus the existing Node calling suite. Record the successful run and test totals in the delivered release notes. No physical-device acceptance is claimed here.

## Outstanding release work

- Original release keystore is required for an installable update preserving the existing installation. An unsigned APK/AAB is a build artifact, not an installable release. Supplied 2.0.27 and 2.0.30 builds have different certificates; signing must match the installed build.
- Verify on phones: Android notification permission, background reminders, push/incoming calls, microphone/camera/Bluetooth, screen sharing, deep navigation, large fonts, dark theme, keyboard, offline retry, two-account/two-member sharing and blocked users.
- Daily Life requires connectivity. Reminders are best-effort WorkManager jobs, not exact alarms. Favorites and hidden call-history entries are device-local, not synchronized between phones. Call-history clear applies to the currently loaded 100 entries.
- Existing conversation mute/pin metadata is shared at conversation level; per-member preferences need a separate backend migration before they can behave privately.
- Shared conversation deletion is destructive for participants; private archive/delete-for-me is a separate future feature.
- Full Bengali/Chinese localization and end-to-end accessibility audit remain unfinished. No payment processing, premium billing, offline outbox, bank integration, medicine/health advice or exact-alarm guarantee was added.
- Saved messages/notifications and shopping lists still use bounded initial server fetches; full cursor pagination needs further work for very large accounts.

No production chat was deleted and no live user data was used as a destructive test fixture.
