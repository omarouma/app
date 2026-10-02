# GaGa Chat — Two-Account Verification Plan (Spec Area 17)

This document is the release gate for the chatroom improvement specification. It
records, for each of the twelve required two-account tests, the exact procedure a
tester follows, the passing result, and the concrete code path that implements the
behaviour. Two real accounts are required (Account A on one device/emulator,
Account B on another) because every test exercises the round-trip between sender
and recipient through the live Supabase + Firebase + ZEGOCLOUD backend.

The backend under test is Supabase project `fcjgbbmfqdkucfpqjxae.supabase.co`
(PostgREST, Realtime, Storage, GoTrue) with the Edge Functions `zego-token` and
`create-call`. The app under test is `gagachat.app` v2.0.18 (versionCode 20).

## Preconditions common to every test

Both accounts must be signed in and have an existing one-to-one conversation open
before the test begins. Confirm that Realtime is connected by checking that a plain
text message sent from A appears on B within two seconds. If Realtime is not
connected, no test below is meaningful, because the app falls back to polling and
the timing assertions will be unreliable. Record the build SHA-256 of the APK and
the device models in the run log so a failure can be reproduced.

## Test 1 — Send each attachment between two accounts

The tester opens the attachment sheet on Account A and sends, in order, a photo, a
captured camera image, a video, a voice message, an audio file, a document, a
contact card, a static location, and a poll. For each item the tester waits for the
status tick to reach "Read" and then opens the corresponding message on Account B.

The passing result is that the recipient can open the correct content with accurate
status. Concretely: the photo and camera image open in the full-screen viewer at the
correct orientation; the video plays with audio; the voice message plays back with
the waveform and the correct duration; the audio file plays in the media player; the
document opens via the system chooser with the correct file name and size; the
contact card offers "Message" and "Call" actions that resolve to the shared number;
the static location shows the coordinates, a reverse-geocoded address, and an
"Open in Maps" action; and the poll renders the question with tappable options.

Implementation: the attachment pipeline lives in
`feature/chat/.../presentation/components/MessageComposer.kt` (source pickers) and
`core/data/.../repository/MediaRepository.kt` (upload + signed URL). Per-type
metadata (duration, contact payload, coordinates, poll question/options) is carried
in the Supabase `messages.metadata` jsonb column and mapped in
`core/data/.../mapper/DtoMappers.kt`. Delivery status is derived from the
`delivered_at`/`read_at` columns and surfaced by `MessageMeta`/`StatusTick`.

## Test 2 — Interrupt an upload

The tester starts sending a large photo or video on Account A and, once the upload
progress indicator appears, toggles Airplane Mode on for roughly ten seconds and
then off again.

The passing result is that the retry completes without duplicate messages or
corrupted files. After reconnection, exactly one message must appear on both
accounts, the thumbnail and the full asset must both open, and the byte size of the
received file must match the source.

Implementation: uploads run through the outbox in `sync/outbox` and the workers in
`sync/workers`. A failed upload is retried with the same client-generated message
id, and the local row is updated in place rather than re-inserted, which prevents
duplicates. The `beginMediaSend()` debounce in `ChatViewModel` prevents a double
send if the user taps again during the interruption.

## Test 3 — Kill and reopen the app during sending

The tester sends a message on Account A and, while the status tick still shows
"Sending", force-stops the app from the system settings, then reopens it.

The passing result is that pending work is recovered or shown with an actionable
failure state. On reopen, the message must either complete on its own (if the outbox
worker resumes) or display a "Failed — tap to retry" affordance that, when tapped,
successfully sends the message exactly once.

Implementation: the Room database persists every outgoing message with its status,
and `sync/outbox` re-enqueues unsent rows on process start. `ChatViewModel` observes
the local row and exposes the retry action; the `MessageMeta` component renders the
retry affordance with a content description for screen readers.

## Test 4 — Deny permissions

The tester revokes Camera, Microphone, and Location permissions for the app, then
attempts to capture a photo, record a voice message, and share a location.

The passing result is that the app remains usable and explains recovery. No flow may
crash or hang; each denied action must show a clear rationale and, where the OS
allows, a "Grant permission" shortcut that re-triggers the system prompt. The rest of
the chat (text, documents, contacts) must continue to work normally.

Implementation: each capture entry point checks the permission before launching the
system intent and routes to a rationale dialog on denial. The location flow in
`ChatViewModel.acquireLocation()` and `shareLiveLocation()` gates on the runtime
permission and falls back to an explanatory notice rather than a silent failure.

## Test 5 — Use slow or disconnected internet

The tester throttles Account A to a slow profile (for example 2G) or disconnects it
entirely, sends several text and media messages, and then restores the connection.

The passing result is that messages queue clearly and reconcile after reconnecting.
Queued messages must be visually distinct (a clock or "Sending" tick), must preserve
their original order, and must all arrive on Account B in that order once the network
returns, with no losses and no duplicates.

Implementation: the outbox preserves insertion order and retries with backoff; the
Realtime subscription plus a periodic reconciliation query in
`core/data/.../repository/MessageRepository.kt` merge server and local state by
message id and sort timestamp.

## Test 6 — Open a location with failed tiles

The tester opens a chat that contains a location message while the map tile provider
is blocked (for example by disabling data for the tile host) so the map fails to
render.

The passing result is that coordinates/address and an external map action remain
available. The message bubble must still show the latitude and longitude and the
reverse-geocoded address, and the "Open in Maps" button must hand off to the external
maps app even when the in-app tile preview is blank.

Implementation: the location bubble in
`feature/chat/.../presentation/components/MessageBubble.kt` renders the textual
coordinate fallback and the external intent independently of the tile image, so a
tile failure never removes the actionable content.

## Test 7 — Stop or expire live location

The tester starts a live location from Account A with the shortest duration, then
(a) taps Stop on Account B's view and (b) in a second run lets the timer expire
naturally.

The passing result is that updates stop and access follows the expiry rules. After
Stop, the bubble on both accounts must switch from the LIVE state to an "Ended"
state and no further coordinate updates may arrive. After natural expiry, the same
must happen automatically at the configured deadline, and the stored coordinates must
no longer refresh.

Implementation: `ChatViewModel.startLiveLocationUpdates()` runs a 30-second update
loop that checks the `liveExpiresAt` deadline each iteration and cancels itself on
expiry or on `stopLiveLocation()`. The deadline is persisted in the message metadata
(`live_expires_at`) so it survives a restart, and the bubble's `produceState`
countdown drives the LIVE/Ended chip.

## Test 8 — Vote concurrently

The tester opens the same poll on both accounts and taps different options at nearly
the same instant, then taps the same option twice on one account.

The passing result is that counts remain correct and duplicate votes are prevented.
The final tally on both accounts must agree, a single account may hold at most one
selection in a single-choice poll, and re-tapping the current selection must toggle it
off without creating a phantom vote.

Implementation: votes are stored in the `reactions` jsonb column under `opt:<index>`
keys and reconciled through the existing Realtime reactions path. The
`votePoll()` method in `MessageRepository` removes the user's other `opt:` keys before
writing the new one (single-choice invariant) and patches the row via
`updateMessageReactions`, so a concurrent write converges to one vote per user.

## Test 9 — Attempt unauthorized attachment access

The tester copies a media signed URL from one conversation and attempts to open it
from a second account that is not a member of that conversation, and also after the
signed URL has expired.

The passing result is that access is rejected. The request must fail (HTTP 400/403)
rather than return the file, and the app must show a graceful "attachment
unavailable" state instead of a broken image.

Implementation: media is served from Supabase Storage through short-lived signed
URLs minted per request; the Storage row-level-security policies restrict object
reads to conversation members, and the signed URLs expire. The client requests a
fresh signed URL on each open (`rememberSignedMediaUrl`) and degrades to a
placeholder when the request is rejected.

## Test 10 — Receive calls in foreground/background

The tester places a voice call and a video call from Account A to Account B while B
is (a) in the foreground on another screen and (b) backgrounded or with the screen
locked.

The passing result is that supported call states and notifications behave accurately.
In the foreground, B must see the in-app incoming-call screen with Accept/Decline; in
the background, B must receive a high-priority notification that opens the call
screen when tapped. Accepting must connect audio (and video for a video call), and
declining or letting it ring out must return both sides to a clean state.

Implementation: the ZEGOCLOUD Call Kit is driven by `ZegoCallManager` and
`CallViewModel` in `feature/calls`. Before inviting, `awaitConnection()` waits for
the ZIM connection so the callee's userID exists; ZIM errors such as 6000011 are
mapped to human-readable messages. Background delivery uses Firebase Cloud Messaging
with the `create-call`/`zego-token` Edge Functions issuing tokens.

## Test 11 — Use large text and mixed languages

The tester sets the system font scale to the maximum, switches the app language
between English, Bengali, and Chinese, and enables the screen reader.

The passing result is that controls remain readable and accessible. Labels must not
clip or overlap at the largest font scale, the language switch must relabel the UI
(including the new Chinese option) without restarting into a broken state, and every
interactive control must expose a meaningful screen-reader label. Status must never be
conveyed by colour alone.

Implementation: text uses `TextScale` and theme typography that honours the system
font scale; the locale is applied in `MainActivity.attachBaseContext` via
`LocaleHelper.wrap()` reading `AppLocaleStore`. The `AppLanguage` enum now offers
English, Bengali, and Chinese. Delivery ticks and live-location state carry
`contentDescription`s, and the storage screen shows a live cache-size read-out.

## Test 12 — Browse a long media-heavy conversation

The tester opens a conversation containing several hundred messages and dozens of
images and videos, then scrolls rapidly from the newest message to the oldest and
back.

The passing result is that scrolling stays smooth and memory use remains controlled.
The list must page older messages in without stalling the UI thread, thumbnails must
decode off the main thread and stay bounded in memory, and the app must not grow
without limit or be killed by the system.

Implementation: the message list is a `LazyColumn` that loads older pages through
`ChatViewModel.loadOlder()` using `Constants.MESSAGE_PAGE_SIZE` until
`hasMoreOlder` is false. Images load through Coil with size-bounded requests
(`signedThumb`) and a disk/memory cache budget, and the storage screen exposes a
"Clear media cache" action backed by `SettingsViewModel.clearMediaCache()`.

## Result matrix

| # | Test | Passing result | Status |
|---|------|----------------|--------|
| 1 | Send each attachment between two accounts | Recipient opens correct content with accurate status | ☐ |
| 2 | Interrupt an upload | Retry completes without duplicates or corruption | ☐ |
| 3 | Kill and reopen the app during sending | Pending work recovered or actionable failure | ☐ |
| 4 | Deny permissions | App usable, explains recovery | ☐ |
| 5 | Slow or disconnected internet | Queues clearly, reconciles after reconnect | ☐ |
| 6 | Open a location with failed tiles | Coordinates/address + external map action remain | ☐ |
| 7 | Stop or expire live location | Updates stop, expiry rules followed | ☐ |
| 8 | Vote concurrently | Counts correct, duplicates prevented | ☐ |
| 9 | Attempt unauthorized attachment access | Access rejected | ☐ |
| 10 | Receive calls foreground/background | Call states + notifications accurate | ☐ |
| 11 | Large text and mixed languages | Readable and accessible | ☐ |
| 12 | Browse a long media-heavy conversation | Smooth scroll, controlled memory | ☐ |

A test is only marked passing when both accounts agree on the observed state and the
run log records the APK hash, the device models, and the network conditions used.
