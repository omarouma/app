# Call & Chat Real Fixes

## [x] Fix 1 — GroupChatPage real (hard) delete
Wired context-menu Delete to `handleDeleteMessage`:
- Own messages → `deleteGroupMessageForEveryone` (soft-delete "This message was deleted")
- Other participants' messages → `deleteGroupMessage` (hard delete)
Replaced the placeholder `toast.info('Delete not available in groups yet')`.

## [x] Fix 2 — Surface Agora config error through call context
- `useWebRTCManager.ts`: expose `configuredError` when Agora is not configured.
- `CallContextBase.ts`: add `configuredError` to `CallContextValue`.
- `CallContext.tsx`: pass `configuredError` through.
- `CallOverlay.tsx`: show clear error banner instead of stuck "Connecting…" ring.

## [x] Fix 3 — CallsPage backend gate wording
Correct misleading "Connection error. Cannot place calls" message; the gate is a Supabase availability check.

## [x] Fix 4 — Verification
`tsc --noEmit -p tsconfig.app.json` passes clean (empty output, no type errors).
