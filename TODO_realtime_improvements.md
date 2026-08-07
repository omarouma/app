# Real-Time Improvements — Implementation Tracking

## Baseline (done)

- [x] tsc clean (0 errors)
- [x] ESLint clean (0 warnings) — fixed `useChatEffects.ts` unused import + `ChatRoom.tsx` unused eslint-disable

## High Priority Implementations

### Item 1 — WebSocket transport resilience in `src/lib/supabaseDb.ts` ✅

- [x] Add `.on('system', …)` handlers (SUBSCRIBED / ERROR / WEB_TRANSPORT_CLOSED) to `subscribeToDoc` + `subscribeToCollection`
- [x] Auto re-subscribe on transport close (2s backoff)
- [x] Dispatch `gaga-realtime-status` window CustomEvent
- [x] Export `getRealtimeStatus()` + `onRealtimeStatusChange()` (also re-exported from `firestore.ts`)
- [x] **NEW:** `NetworkStatusBanner.tsx` now subscribes to the realtime status bus and surfaces "Reconnecting to live updates…" / offline state independently of browser online/offline.

### Item 2 — Atomic unread counters ✅

- [x] `supabase_realtime_fixes.sql`: `increment_chat_unread(p_chat_id, p_sender_id)` RPC
- [x] `supabaseDb.ts`: `incrementChatUnread()` helper (RPC + fallback to `updateChatUnreadFallback`)
- [x] `useChatStore.ts`: wired into `sendMessage` (atomic per-recipient increment with client-side fallback)

### Item 3 — Batched markAsRead ✅

- [x] `supabase_realtime_fixes.sql`: `mark_chat_read(p_chat_id, p_user_id)` RPC
- [x] `supabaseDb.ts`: `markChatRead()` helper (RPC + fallback to client-side loop)
- [x] `useChatStore.ts`: wired into `markAsRead` (RPC first with optimistic UI update, falls back to loop)

## Verification

- [x] tsc clean (0 errors — `npx tsc -b --noEmit`)
- [x] Full production build passes (`npm run build` → `✓ built in 13.74s`)
- [x] ESLint clean on modified hooks (usePresence, useLiveStreamRTC, useVoiceRoomRTC, useTyping, useChatListTyping, useChatEffects)

### Resilience applied to all direct Supabase realtime channel subscribers ✅

All direct `.channel()` subscribers across the app now use the `attachRealtimeResilience` helper (reconnect/backoff + status bus):

- `src/hooks/usePresence.ts` (presence channel)
- `src/hooks/useLiveStreamRTC.ts` (live stream signals)
- `src/hooks/useVoiceRoomRTC.ts` (voice room signals)
- `src/hooks/useTyping.ts` (typing channel)
- `src/hooks/useChatListTyping.ts` (chat-list typing channel)
- `src/hooks/useChatEffects.ts` (user presence channel)
- `src/lib/webrtc.ts` (call signaling)
- `src/lib/supabaseAuth.ts` (profile channel)
- `src/lib/supabaseDb.ts` (subscribeToDoc / subscribeToCollection internal channels)
