# GaGa Chat - Complete Production Polish Plan

## Phase 1: Critical Bug Fixes & Cleanup 🚨

- [ ] 1.1 Fix broken Unicode escapes in CreatorCenterPage.tsx
- [ ] 1.2 Delete empty `ProfilePage.tsx.new` file
- [ ] 1.3 Delete empty `in` file at root
- [ ] 1.4 Remove unused `App.css` import from `App.tsx` and delete file
- [ ] 1.5 SSR-safety: fix `useIsMobile` hook
- [ ] 1.6 Delete empty `tsc-out.txt`

## Phase 2: Profile Page Redesign 🎨

- [ ] 2.1 Complete profile redesign with editable fields, avatar, stats
- [ ] 2.2 Add stories ring display
- [ ] 2.3 Add posts/friends/followers stats

## Phase 3: UI Polish & Accessibility ✨

- [ ] 3.1 Add skip-to-content link
- [ ] 3.2 Add `prefers-reduced-motion` respect to framer-motion components
- [ ] 3.3 Improve BottomNav with active tab transitions
- [ ] 3.4 Improve aria-label coverage
- [ ] 3.5 Add animated page transitions

## Phase 4: Performance Optimization ⚡

- [ ] 4.1 Ensure all images use LazyImage component
- [ ] 4.2 Optimize bundle chunks in vite.config.ts

## Phase 5: CSS & Theme Refinements 🎭

- [ ] 5.1 Properly integrate CSS architecture
- [ ] 5.2 Add custom font (Inter)
- [ ] 5.3 Fix dark-mode overrides to use CSS variables
- [ ] 5.4 Add dark-mode transitions

## Phase 6: Build & Validate

- [ ] 6.1 Run `npm run build`
- [ ] 6.2 Verify bundle sizes
