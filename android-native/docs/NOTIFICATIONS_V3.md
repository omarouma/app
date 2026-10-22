# Notifications V3 (issue #135)

This note records the notification changes shipped after 2.8.14. The goal is
parity between the in-app chat surface and the system tray, without turning the
tray into a privilege boundary.

## What changed

### 1. Mute is enforced at the push boundary

`PushHandler` used to post every inbound message. It now reads the recipient's
local per-chat mute flag through `ConversationRepository.isMuted()` and asks the
pure `NotificationPolicy.shouldNotifyForMessage()` whether to surface the
message.

The rules are deliberately conservative:

| Chat state | Ordinary message | Confirmed @mention / reply-to-me |
| --- | --- | --- |
| Unmuted direct | notify | notify |
| Unmuted group | notify | notify |
| Muted group | suppress | notify (mention override) |
| Muted direct | suppress | suppress |
| Explicit `MUTE` mode | suppress | suppress |

An explicit mute is absolute. The mention override only exists so that a busy
group can stay quiet without hiding a message that was addressed to the user by
name. OS Do Not Disturb remains authoritative and is never bypassed.

`NotificationMode` (`ALL`, `MENTIONS_ONLY`, `MUTE`) and its parser live in
`core:model`, so the same rules can be reused by the in-app audio path and by
future server-side fan-out. `NotificationPolicyTest` exercises every row above.

### 2. Per-conversation grouping

All message notifications previously shared one global group key, so two
different chats collapsed into a single tray stack. Each conversation now gets:

- `NotificationPolicy.groupKey(conversationId)` — the group key;
- `NotificationPolicy.conversationNotificationId(conversationId)` — the child id;
- `NotificationPolicy.summaryId(conversationId)` — the summary id;
- `NotificationPolicy.shortcutId(conversationId)` — the conversation shortcut id.

`NotificationHelper.showMessage()` posts a `MessagingStyle` child and a matching
`InboxStyle` summary with `setGroupSummary(true)`. Children use
`GROUP_ALERT_CHILDREN`, so only the newest message in a chat alerts.

### 3. Inline actions

`NotificationActionReceiver` is an explicit, non-exported `BroadcastReceiver`.
Every action re-checks the authenticated session and calls the same repository
method the UI would.

| Action | Behaviour |
| --- | --- |
| `ACTION_REPLY` | Reads the `RemoteInput` text and calls `MessageRepository.sendText()`; the outbox delivers it. |
| `ACTION_MARK_READ` | Calls `ConversationRepository.markRead()` with the notification's message id, falling back to the chat's last message id. |
| `ACTION_DECLINE_CALL` | Calls `CallRepository.endCall(callId, REJECTED, null)` and dismisses the ringing notification. |
| `ACTION_CALL_BACK` | Opens `gagachat://chat/<id>`. It never places a call on its own. |

The Reply action uses a `FLAG_MUTABLE` `PendingIntent`, which `RemoteInput`
requires; all other actions use `FLAG_IMMUTABLE`. The receiver is registered in
`AndroidManifest.xml` with `android:exported="false"`.

### 4. Call notifications

- Incoming call: **Accept** (opens the incoming-call surface, which fetches its
  own LiveKit token) and **Decline** (rejects the call).
- Missed call: **Call back** opens the originating chat.
- Active call: the foreground-service notification now carries **Mute/Unmute**
  in addition to **End call**, and its text reads "Call in progress · Muted"
  while the microphone is off. The toggle calls
  `LiveKitCallManager.setMicrophoneEnabled()` and re-posts the notification.

## Security notes

- No LiveKit token, access token or call credential is ever placed in a
  notification. Accepting a call only opens the screen that requests its own
  room-scoped token from the `livekit-token` Edge Function.
- The receiver is not exported, so other apps cannot forge replies or call
  actions.
- Reply and mark-read both require a valid session; without one they no-op.
- Notification content still respects the user's preview setting: when previews
  are off or the app is locked, the sender name is omitted from the tray.

## Follow-ups (not in this change)

- Server-side fan-out still cannot see per-chat mute settings; the client-side
  check is authoritative for now. A future `notification_preferences` join in
  `send-fcm-push` would save wasted pushes.
- Per-conversation notification channels (rather than shortcut ids) would let
  users tune sound per chat on Android 8+.
- Direct-reply should re-post the notification with the sent message appended
  before dismissing, to match the platform's inline-reply affordance.
