# GaGa Chat Android screens against Master Guide v1

The Guide describes a production platform. A compiled UI does not establish that its remote service works. Status below distinguishes Android wiring from end-to-end verification.

| Guide module | Android UI / route | Current status |
| --- | --- | --- |
| Onboarding | Splash, AuthActivity phone login/registration and language in Settings | Partial: OTP, recovery, policy consent and device binding depend on backend and finalized policy |
| Home | MainActivity chats, calls, contacts, wallet placeholder, profile | Implemented; remote content needs device/backend verification |
| Chat | ChatActivity text, attachment, typing, read, delete, call entry | Partial: reply, forward, reactions, mentions, pin and full search still need contract and UI |
| Media | ChatActivity image/file upload and ImageViewActivity | Partial: retry, upload progress and detailed video preview need work |
| Voice Notes | VoiceNoteActivity records, previews, sends, discards audio | Implemented in client; upload/playback requires backend and device testing |
| Groups | CreateGroupActivity and GroupActivity | Partial: managed roles/permissions must be verified end-to-end |
| Calls | Home Calls tab, CallHistoryActivity, CallActivity, IncomingCallActivity | Partial: TURN/mobile-network recovery needs real device and server verification |
| Profile | ProfileActivity and Me tab | Partial: QR and privacy controls need design and API contracts |
| Safety | SafetyActivity block/report | Partial: device/session list and moderation operations need backend contracts |
| Settings | SettingsActivity, NotificationSettingsActivity, StorageActivity | Partial: in-app alert controls, cache cleaning, theme/language, account export/delete are wired; OS-rendered push needs a data-only payload policy |
| Local data | Encrypted SessionStore, text outbox worker | Partial: Room cache, media outbox, migration and draft persistence are not implemented |
| Wallet | Disabled placeholder | Deferred per Guide until regulated services are ready |

The QA build uses `gagachat.app` and `https://api.gagachat.app/api`. OTP and wallet are disabled. A signed Play release needs protected CI signing material and a verified backend. Do not label this Android package production-ready until the Guide's launch gates have passed.
