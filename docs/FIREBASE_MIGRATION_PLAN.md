# GaGa Chat — Firebase Migration Plan (Target Architecture)

**Date:** 2026-10-05
**Companion documents:** `FIREBASE_MIGRATION_AUDIT.md` (current state),
`FIREBASE_MIGRATION_RUNBOOK.md` (execution), `RELEASE_ACCEPTANCE_CHECKLIST.md`.

This document fixes the target architecture, the concrete data model, the access
rules and the trusted-backend contracts that the implementation in this branch
conforms to.

---

## 1. Component responsibilities

| Component | Responsibility | Constraint |
| --- | --- | --- |
| **Firebase Authentication** | Registration, login, email verification, password reset. | Unverified accounts cannot reach protected chat features (enforced in rules + backend). |
| **Cloud Firestore** | Conversations, messages, membership, requests, receipts, preferences. | Participant-only, realtime, paginated, offline-capable. |
| **Realtime Database** | Online presence and typing. | Disconnect handling, expiring typing, privacy-aware visibility. |
| **Firebase Cloud Messaging** | Message alerts and incoming-call invitations. | Device-token lifecycle, notification privacy, duplicate prevention. |
| **Supabase Storage** | Photos, videos, voice, documents. | **Private** objects; authorization by Firebase identity **and** conversation membership. |
| **Trusted backend (Supabase Edge Functions)** | Media authorization, push dispatch, call admission, privileged actions. | Verifies Firebase ID tokens; enforces blocking/membership/caller rules. |
| **LiveKit** | Voice/video media transport. | Authorized rooms, reliable routing, reconnection. |
| **Local Android DB (Room)** | Cached conversations/messages/pending sends. | Fast startup, durable outbox, **per-account separation**. |

**Explicit exclusions for this phase:** Firebase billing stays disabled; Firebase
Cloud Storage is not used. Supabase edge functions remain; the Supabase **chat
database** is retired only after cutover, not the whole Supabase project.

---

## 2. Identity model

### 2.1 The mapping record

A single server-owned collection/table is the **only** authority that ties a
Firebase identity to a GaGa user id.

```
gaga_identities (Supabase Postgres, service-role only)
  firebase_uid   text  primary key
  gaga_user_id   uuid  unique, not null      -- the legacy/authoritative id
  email          text  (informational; never used for linking)
  method         text  ('migrated' | 'signup' | 'linked')
  email_verified boolean not null default false
  created_at     timestamptz
  updated_at     timestamptz
```

### 2.2 Linking rules (P0 — "never link on email alone")

1. A brand-new Firebase account (`method='signup'`) is created **only** by the
   `firebase-identity` function, which mints the `gaga_user_id` itself. No email
   match is consulted.
2. An **existing** GaGa account is linked (`method='migrated'`) only when the
   caller presents **both**:
   - a valid Firebase ID token (proves control of the Firebase account), **and**
   - a valid legacy Supabase session for the *same* email (proves control of the
     legacy account).
   The backend compares the two **verified** subjects; it never links because two
   strings happen to be equal.
3. If an email already has a mapping and a *different* Firebase uid tries to
   claim it, the request is rejected (`IDENTITY_CONFLICT`) and logged. It is
   never silently merged.

### 2.3 Token compatibility

Every privileged endpoint accepts **either** a Firebase ID token **or** a legacy
Supabase access token, resolved to a canonical `gaga_user_id` by
`supabase/functions/_shared/auth.ts`. This is what makes "Firebase login works
with private media and LiveKit" true without a flag day.

---

## 3. Firestore data model

```
users/{gagaUserId}
  displayName, gagaId (unique), photoUrl, about
  createdAt, updatedAt
  emailVerified (bool)
  private/                     <-- never world-readable
    email, phone, settings{}, lastSeen, fcmTokens[]

chats/{chatId}
  type: 'dm' | 'group' | 'saved'
  title?, photoUrl?            (group only)
  createdBy, createdAt
  lastMessageAt, lastMessagePreview, lastMessageSenderId
  participants: [gagaUserId]   (denormalised for rule checks)
  memberCount

  members/{gagaUserId}
    role: 'owner' | 'admin' | 'member'
    joinedAt
    notificationPref: 'all' | 'mentions' | 'none'
    archived: bool
    pinned: bool
    lastReadMessageId?, lastReadAt?

  messages/{messageId}
    senderId, type, text?
    serverTs (serverTimestamp), clientTs
    replyToId?
    editedAt?, deletedAt?, deletedFor: [uid]?
    attachments: [ { objectId, name, mime, size, width?, height?, durationMs?, state } ]

    reactions/{uid}   { emoji, at }   <-- doc id == reactor; forgery impossible
    receipts/{uid}    { state: 'delivered'|'read', at }  <-- doc id == recipient

  typing/{uid}
    isTyping, updatedAt

requests/{requestId}
  fromUserId, toUserId, status: 'pending'|'accepted'|'deleted'|'blocked', createdAt, updatedAt

call_history/{callId}
  callerId, calleeId, participantIds, type, status, roomId, createdAt, endedAt, durationMs
```

**Bounded queries only.** The chats screen queries
`chats where participants array-contains uid order by pinned desc, lastMessageAt
desc limit N`. Message history is `messages order by serverTs desc limit N` with
an upward cursor. Nothing loads an unbounded collection.

---

## 4. Realtime Database model

```
presence/{uid}      { state: 'online'|'offline', lastChanged }
typing/{chatId}/{uid} { typing: bool, updatedAt }
```

Presence uses `onDisconnect()` to write `offline` so a killed client cannot stay
"online". Typing rows are treated as expired after a short TTL; the client also
clears them on stop. Rules validate the shape and reject stale/foreign writes.

---

## 5. Access-rule design (the P0 security contract)

`firestore.rules` is rewritten to enforce:

1. **Participant-only reads** on every chat subcollection (via `members/`).
2. **No self-granted membership**: a user may not add themselves to a chat, nor
   change their own `role` to admin/owner. Membership changes require an
   existing admin/owner.
3. **Author-only message edits**: only `senderId == uid()` may change message
   content; the only fields others may touch are their **own** receipt/reaction
   key.
4. **Receipt ownership**: a receipt doc id is `{messageId}_{uid}` and may only be
   written by that `uid` — forging another user's receipt is impossible.
5. **Reaction ownership**: a user may only write the map entry keyed by their own
   uid.
6. **Profile field separation**: `users/{uid}` public fields are readable by
   authenticated users; `users/{uid}/private/**` is readable only by the owner.
7. **Deny by default** for everything else.

`database.rules.json` adds typing/presence validation + expiry shape and keeps
presence owner-writable with `onDisconnect` support.

---

## 6. Trusted-backend contracts

| Function | Auth | Purpose |
| --- | --- | --- |
| `firebase-identity` | Firebase ID token (required) | Create/link the mapping; return `gaga_user_id` + profile. |
| `media-auth` | Firebase ID token **or** Supabase token | Authorize a Supabase Storage object for a verified member; return a short-lived signed URL. |
| `send-fcm-push` | Service role (internal) | Fan out one push per event; dedup by event id. |
| `livekit-token` | Firebase ID token **or** Supabase token | Verify call membership + admission, mint a room-scoped LiveKit JWT. |
| `create-call` | Firebase ID token **or** Supabase token | Verify caller/recipient eligibility, create the call, ring once. |

All of them resolve the caller through `_shared/auth.ts`, which verifies the
Firebase ID token against Google's public keys (RS256, `aud` = project id,
`iss` = `https://securetoken.google.com/<project>`) and falls back to Supabase
GoTrue for legacy tokens.

---

## 7. Staged execution and completion gates

| Stage | Work | Gate |
| --- | --- | --- |
| 1 | Audit source/identities/records/rules/storage | ✅ this branch (`FIREBASE_MIGRATION_AUDIT.md`) |
| 2 | Firebase auth, identity mapping, backend token validation | Existing + new users authenticate safely |
| 3 | Firestore chat transport, rules, cache, send queue | Two accounts exchange messages without duplicates |
| 4 | Firebase-authorized Supabase media | Upload/download/deny tests pass |
| 5 | Calling invitation, sounds, LiveKit lifecycle | Two-device voice/video tests pass |
| 6 | Chats/chatroom design + remaining P1 | Screen/a11y/lifecycle checks pass |
| 7 | History migration, cutover, release signing | Reconciliation + regression checks pass |

Stages 2–4 are implemented in this branch at the backend + source level; the
device-dependent gates for stages 5–7 are tracked in the release checklist.
