# GaGa Chat — Fixing ESLint & Code Quality Issues

## Progress Tracker

### Phase 1: Fix `AddFriendsPage.tsx` (33 no-explicit-any errors)
- [ ] 1.1 Type `mapUser(u: any)` → `mapUser(u: Record<string, unknown>)`
- [ ] 1.2 Type `catch (err: any)` → `catch (err: unknown)` with error message helper
- [ ] 1.3 Replace `(user as any).verified` → `user.verified`
- [ ] 1.4 Type request lookups (`s.find((s: any)`, `reqList.find((r: any)`)
- [ ] 1.5 Remove `any` from `requests.filter((r: any)`, `suggestions.map((u: any)`
- [ ] 1.6 Type `pendingRequests.map((req: any)`, `sentRequests.map((req: any)`
- [ ] 1.7 Type `findNearbyUsers`/`findContactsOnGaga` `(u: any)`, `(c: any)`, `(f: any)`

### Phase 2: Fix `NotificationsPage.tsx` (1 set-state-in-effect error)
- [ ] 2.1 Remove `useEffect(() => setSelectedIds([]))` and reset via `changeFilter` helper

### Phase 3: Code quality — `TimelinePage.tsx`
- [ ] 3.1 Consolidate duplicate `@/lib/firestore` imports

### Verification
- [ ] `npm run lint` — no ESLint errors
- [ ] `npx tsc --noEmit` — no TypeScript errors
