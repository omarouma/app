# Security Fixes Progress

## Issues to Fix

1. **ChatRoom.tsx - PIN plaintext comparison** — Compare hashed PINs instead
2. **ChatRoom.tsx - Translation API no sanitization** — Use sanitizeText before fetch
3. **supabaseDb.ts - console.error leaks schema** — Gate behind DEV check
4. **pushNotificationService.ts - console.warn in production** — Gate behind DEV check
5. **storage.ts - Error messages leak config** — Sanitize error output
6. **sw.js - postMessage missing targetOrigin** — Add second arg
7. **sanitize.ts - URL_REGEX has unescaped <>** — Fix regex pattern

## Status

- [ ] Fix 1: ChatRoom.tsx + useChatStore.ts — Hash PIN before storage/comparison
- [ ] Fix 2: ChatRoom.tsx — Sanitize translation API input
- [ ] Fix 3: supabaseDb.ts — DEV-gated console.error
- [ ] Fix 4: pushNotificationService.ts — DEV-gated console.warn
- [ ] Fix 5: storage.ts — Sanitize error messages
- [ ] Fix 6: sw.js — Add targetOrigin to postMessage
- [ ] Fix 7: sanitize.ts — Fix URL_REGEX pattern

