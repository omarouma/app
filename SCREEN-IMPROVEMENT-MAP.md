# Screen and feature implementation map

Status: inventory of all 51 page modules, with concrete implementation/verification tasks. Shared offline/error recovery changes affect every app route. This is not a completed visual or authenticated end-to-end audit. Calling is the current implementation priority.

| Source screen | Priority | Implementation and verification work |
|---|---|---|
| `src/pages/AIChatPage.tsx` | P2 | Review navigation, published content/contact details, accessibility and responsive layout; shared offline/error recovery applied. |
| `src/pages/AboutPage.tsx` | P2 | Review navigation, published content/contact details, accessibility and responsive layout; shared offline/error recovery applied. |
| `src/pages/AddFriendsPage.tsx` | P1 | Validate identity/privacy, search limits, blocked-user enforcement, request races and authorized QR/navigation actions. |
| `src/pages/AdminPage.tsx` | P0 | Validate server admin authorization and audit logs; populate metrics only from actual events; never rely on client admin flags. |
| `src/pages/AnalyticsPage.tsx` | P0 | Validate server admin authorization and audit logs; populate metrics only from actual events; never rely on client admin flags. |
| `src/pages/BlockedUsersPage.tsx` | P1 | Validate identity/privacy, search limits, blocked-user enforcement, request races and authorized QR/navigation actions. |
| `src/pages/BlogPage.tsx` | P2 | Review navigation, published content/contact details, accessibility and responsive layout; shared offline/error recovery applied. |
| `src/pages/BookmarksPage.tsx` | P1 | Validate real content, upload errors, moderation, paging, concurrent actions and empty states; demo feed substitution removed where identified. |
| `src/pages/BroadcastListsPage.tsx` | P0 | Retained messaging fixes; validate server membership, pagination, offline media, receipt consistency and two-user behavior. |
| `src/pages/CallPage.tsx` | P0 | New native call path and shared UX changes implemented; physical-device/TURN and invitation tests pending. |
| `src/pages/CallsPage.tsx` | P0 | New native call path and shared UX changes implemented; physical-device/TURN and invitation tests pending. |
| `src/pages/CareersPage.tsx` | P2 | Review navigation, published content/contact details, accessibility and responsive layout; shared offline/error recovery applied. |
| `src/pages/ChatInfoPage.tsx` | P0 | Retained messaging fixes; validate server membership, pagination, offline media, receipt consistency and two-user behavior. |
| `src/pages/ChatRoomPage.tsx` | P0 | Retained messaging fixes; validate server membership, pagination, offline media, receipt consistency and two-user behavior. |
| `src/pages/ChatsPage.tsx` | P0 | Retained messaging fixes; validate server membership, pagination, offline media, receipt consistency and two-user behavior. |
| `src/pages/CommunityGuidelinesPage.tsx` | P2 | Review navigation, published content/contact details, accessibility and responsive layout; shared offline/error recovery applied. |
| `src/pages/ContactsPage.tsx` | P1 | Validate identity/privacy, search limits, blocked-user enforcement, request races and authorized QR/navigation actions. |
| `src/pages/CookiePolicyPage.tsx` | P2 | Review navigation, published content/contact details, accessibility and responsive layout; shared offline/error recovery applied. |
| `src/pages/CreateGroupPage.tsx` | P0 | Retained messaging fixes; validate server membership, pagination, offline media, receipt consistency and two-user behavior. |
| `src/pages/CreateReelsPage.tsx` | P1 | Validate real content, upload errors, moderation, paging, concurrent actions and empty states; demo feed substitution removed where identified. |
| `src/pages/CreatorCenterPage.tsx` | P1 | Verify server-authoritative balances/entitlements and real provider contracts; do not show local/demo state as completed transactions. |
| `src/pages/CreatorDashboardPage.tsx` | P1 | Verify server-authoritative balances/entitlements and real provider contracts; do not show local/demo state as completed transactions. |
| `src/pages/DailyChallengesPage.tsx` | P1 | Verify server-authoritative balances/entitlements and real provider contracts; do not show local/demo state as completed transactions. |
| `src/pages/EventsPage.tsx` | P1 | Validate real content, upload errors, moderation, paging, concurrent actions and empty states; demo feed substitution removed where identified. |
| `src/pages/GagaRewardsPage.tsx` | P1 | Verify server-authoritative balances/entitlements and real provider contracts; do not show local/demo state as completed transactions. |
| `src/pages/GroupChatPage.tsx` | P0 | Retained messaging fixes; validate server membership, pagination, offline media, receipt consistency and two-user behavior. |
| `src/pages/HashtagsPage.tsx` | P1 | Validate real content, upload errors, moderation, paging, concurrent actions and empty states; demo feed substitution removed where identified. |
| `src/pages/HelpCenterPage.tsx` | P2 | Review navigation, published content/contact details, accessibility and responsive layout; shared offline/error recovery applied. |
| `src/pages/LiveStreamPage.tsx` | P1 | Migrate legacy room media to authenticated Alibaba ICE; add SFU/roles, moderation, lifecycle and capacity tests. |
| `src/pages/LiveStreamsPage.tsx` | P1 | Migrate legacy room media to authenticated Alibaba ICE; add SFU/roles, moderation, lifecycle and capacity tests. |
| `src/pages/MarketplacePage.tsx` | P1 | Validate real content, upload errors, moderation, paging, concurrent actions and empty states; demo feed substitution removed where identified. |
| `src/pages/MorePage.tsx` | P1 | Validate persisted settings, notification delivery, accessibility, translations and account deletion; shared offline/error recovery applied. |
| `src/pages/NotFound.tsx` | P2 | Review navigation, published content/contact details, accessibility and responsive layout; shared offline/error recovery applied. |
| `src/pages/NotificationsPage.tsx` | P1 | Validate persisted settings, notification delivery, accessibility, translations and account deletion; shared offline/error recovery applied. |
| `src/pages/OnboardingPage.tsx` | P1 | Validate persisted settings, notification delivery, accessibility, translations and account deletion; shared offline/error recovery applied. |
| `src/pages/PostPage.tsx` | P1 | Validate real content, upload errors, moderation, paging, concurrent actions and empty states; demo feed substitution removed where identified. |
| `src/pages/PremiumPage.tsx` | P1 | Verify server-authoritative balances/entitlements and real provider contracts; do not show local/demo state as completed transactions. |
| `src/pages/PrivacyPage.tsx` | P2 | Review navigation, published content/contact details, accessibility and responsive layout; shared offline/error recovery applied. |
| `src/pages/ProfilePage.tsx` | P1 | Validate identity/privacy, search limits, blocked-user enforcement, request races and authorized QR/navigation actions. |
| `src/pages/QRScannerPage.tsx` | P1 | Validate identity/privacy, search limits, blocked-user enforcement, request races and authorized QR/navigation actions. |
| `src/pages/ReelsPage.tsx` | P1 | Validate real content, upload errors, moderation, paging, concurrent actions and empty states; demo feed substitution removed where identified. |
| `src/pages/SavedMessagesPage.tsx` | P0 | Retained messaging fixes; validate server membership, pagination, offline media, receipt consistency and two-user behavior. |
| `src/pages/SearchPage.tsx` | P1 | Validate identity/privacy, search limits, blocked-user enforcement, request races and authorized QR/navigation actions. |
| `src/pages/SentRequestsPage.tsx` | P1 | Validate identity/privacy, search limits, blocked-user enforcement, request races and authorized QR/navigation actions. |
| `src/pages/SettingsPage.tsx` | P1 | Validate persisted settings, notification delivery, accessibility, translations and account deletion; shared offline/error recovery applied. |
| `src/pages/ShareTargetPage.tsx` | P0 | Retained messaging fixes; validate server membership, pagination, offline media, receipt consistency and two-user behavior. |
| `src/pages/TermsPage.tsx` | P2 | Review navigation, published content/contact details, accessibility and responsive layout; shared offline/error recovery applied. |
| `src/pages/TimelinePage.tsx` | P1 | Validate real content, upload errors, moderation, paging, concurrent actions and empty states; demo feed substitution removed where identified. |
| `src/pages/VoiceRoomPage.tsx` | P1 | Migrate legacy room media to authenticated Alibaba ICE; add SFU/roles, moderation, lifecycle and capacity tests. |
| `src/pages/VoiceRoomsPage.tsx` | P1 | Migrate legacy room media to authenticated Alibaba ICE; add SFU/roles, moderation, lifecycle and capacity tests. |
| `src/pages/WalletPage.tsx` | P1 | Verify server-authoritative balances/entitlements and real provider contracts; do not show local/demo state as completed transactions. |

Additional views: AuthView, LandingView and desktop views in src/views require the same real-data/authorization, session recovery, keyboard/accessibility and responsive checks. Native Android screens/background behavior are not represented by this web source archive.

Release order: validate one-to-one voice/video and TURN first; then durable chat, permissions/media, notifications and account controls; then social/room features and server-authoritative wallet/monetization. Read alibaba-calling/README.md for the current deployment boundary and limits.
