# Timeline Global Live Production Readiness - Implementation TODO

## Priority 1: Core Real-Time Stability ✅
- [x] **1. Post Deduplication** — Prevent duplicate posts from real-time events using Set-based dedup key
- [x] **2. Cursor-Based Pagination** — Replace offset pagination for scalability with thousands of posts
- [x] **3. Optimistic Updates with Rollback** — Properly revert state on API failures

## Priority 2: Real-Time Interactions ✅ (Partial)
- [ ] **4. Real-Time Comment Syncing** — Subscribe to comment changes when comments section is open
- [ ] **5. Comment Typing Indicators** — Show who's typing a comment using real-time channels
- [x] **6. Post View & Impression Tracking** — Track views via IntersectionObserver, show live counts

## Priority 3: Offline & Performance
- [ ] **7. Offline Post Queue** — Queue failed posts in localStorage, replay when online
- [ ] **8. Virtualized Feed** — Use virtualization for smooth scrolling with hundreds of posts

## Priority 4: Feed Intelligence
- [ ] **9. Algorithmic Feed Mixing** — Blend friends, trending, recommended with weighted ranking
- [ ] **10. Real-Time Interaction Indicators** — Show "X people viewing/reacting" via presence channels

## Verification
- [ ] Test pagination with large datasets
- [ ] Verify dedup removes duplicates in real-time
- [ ] Test optimistic rollback by simulating network failures
- [ ] Verify typing indicators work across browser tabs
- [ ] Performance test virtualized list with 500+ posts

