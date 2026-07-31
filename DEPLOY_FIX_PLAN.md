# GaGa Chat — Deploy Fix Plan (after full app review)

## Goal

Make the app deployable to hosting again by fixing critical build/runtime issues,
then harden correctness/security/performance for the major subsystems:

- backend adapter (`src/lib/firestore.ts` interface)
- scheduled messages (global + per-chat)
- WebRTC signaling performance
- wallet atomicity
- chat locking enforcement

> This plan is based on inspecting `src/App.tsx`, core stores, chat UI, calls overlay + WebRTC, wallet, friends, notifications, and timeline.

---

## Critical fixes (do these first)

### 1) Ensure `src/lib/firestore.ts` exists and matches imports

**Why:** Many components/stores import from `@/lib/firestore` for unified backend
access. If the adapter is missing or incomplete, the app will not build.

**What to do:**

- Create/verify `src/lib/firestore.ts` re-exports the unified API that the code expects (CRUD, query builders, realtime subscriptions, and constants like `COLLECTIONS`).
- Verify real-time helpers: `subscribeToDoc`, `subscribeToCollection`, `subscribeToSubcollection`.

**Status check:**

- Run `npm run build` and ensure no TS2307 missing module errors.

### 2) Remove duplicate scheduled-job execution

**Why:** There is a global overdue checker interval in `src/App.tsx` that sends overdue scheduled messages. Additionally, `ChatRoom` polls pending scheduled messages and `useScheduledMessages` may also send overdue based on local storage.

**What to do:**

- Choose **one** source of truth for scheduled sending:
  - Option A: Single global sender in `App.tsx` only.
  - Option B: Per-chat `useScheduledMessages` only when chat is open.
- Add **idempotency** and persist “sent” marker if using localStorage.

**Acceptance criteria:**

- Scheduled messages send exactly once.
- No backend flood when multiple chats open.

### 3) Fix service worker update flow + avoid reload loops

**Why:** `main.tsx` reloads on certain unhandledrejection patterns; `App.tsx` registers SW and reloads on controller changes. Combined, this can create loops after deploy.

**What to do:**

- Gate reload behavior to only when SW version truly changes.
- Ensure the unhandledrejection handler doesn’t trigger repeatedly.

---

## High priority improvements

### 4) WebRTC signaling ICE performance/race conditions

**Where:** `src/lib/webrtc.ts` appends ICE by selecting current arrays and then updating.

**What to do:**

- Avoid per-ICE candidate read-modify-write.
- Instead:
  - store candidates in separate subcollection/rows keyed by `call_id` + `side` + `index`, or
  - append candidates with a single “write” channel that doesn’t require re-reading the full array.

**Acceptance criteria:**

- Reduced signaling traffic.
- Fewer call failures under poor networks.

### 5) Wallet transfer atomicity

**Where:** `src/store/useWalletStore.ts` uses read-modify-write for sender and receiver balances.

**What to do:**

- Implement atomic transactions in backend (preferred) or add server-side triggers.
- If staying client-only:
  - use a transaction-like update function in Supabase (`rpc` or transactional SQL),
  - or implement optimistic concurrency via version field.

---

## Medium priority fixes

### 6) Chat lock enforcement

**Where:** `ChatRoom` unlock checks against `chat.lockValue` on client.

**What to do:**

- Ensure backend rejects locked chat reads/writes when locked.
- Store lock values as hashes and compare hash, not raw PIN.

### 7) Reduce polling and heavy computations in ChatRoom

**Where:** `ChatRoom` refreshes pending schedules every 5 seconds and does many derived computations.

**What to do:**

- Debounce schedule polling to a longer interval or only refresh when user opens schedule UI.
- Consider splitting chat component into subcomponents (header/messages/input) to improve render boundaries.

---

## Low priority improvements

### 8) Consolidate message rendering (MessageItem vs inline)

**Where:** `MessageItem.tsx` exists but `ChatRoom.tsx` renders inline.

**What to do:**

- Use `MessageItem` inside ChatRoom to improve memoization.

### 9) Types & unsafe any usage cleanup

**Where:** stores have many `any` and casts.

**What to do:**

- Tighten types for message/poll/transferData.

---

## Execution workflow (what I’ll do next)

1. Run `npm run build` to confirm current deploy blockers.
2. Fix compile/runtime blockers first (firestore adapter + scheduled job duplication).
3. Validate with a production build + lint.
4. Then implement WebRTC ICE signaling optimization + wallet atomicity changes.
5. Finally, run deployment command (`firebase-tools` or Vite preview depending on target).

---

## Verification checklist

- [ ] `npm run build` passes
- [ ] App loads from production build without SW reload loops
- [ ] Start a DM, send text, media, reactions, polls
- [ ] Verify scheduled message sends exactly once
- [ ] Perform a call and verify ICE exchange and connection
- [ ] Perform wallet transfer and verify no negative/duplicate balances
