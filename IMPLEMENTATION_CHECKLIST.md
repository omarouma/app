# Implementation Checklist - GaGa Chat Professional Improvements

---

## 📋 WEEK 1: Error Handling & Accessibility (Target: 7 hours)

### Error Handling (3 hours)

- [ ] Create `src/lib/errorHandling.ts`
  - [ ] Copy `AppError` class
  - [ ] Copy `ErrorMessages` constant
  - [ ] Copy `getErrorMessage()` function
  - [ ] Copy `withRetry()` async wrapper
  - [ ] Copy `logErrorEvent()` function
  
- [ ] Update `CallPage.tsx` (1.5 hours)
  - [ ] Replace async operations with `withRetry()`
  - [ ] Add try-catch blocks for all async calls
  - [ ] Call `logErrorEvent()` on errors
  - [ ] Use `getErrorMessage()` for user-friendly text
  - [ ] Test: Try initiating call with offline mode
  
- [ ] Update `GroupChatPage.tsx` message sending (1 hour)
  - [ ] Wrap `sendGroupMessage()` with `withRetry()`
  - [ ] Add validation before sending
  - [ ] Show error toast with `getErrorMessage()`
  - [ ] Test: Send message with network disabled
  
- [ ] Add to other pages (0.5 hours)
  - [ ] `CallsPage.tsx` - wrap call initiation
  - [ ] `ContactsPage.tsx` - wrap contact sync
  - [ ] `NotificationsPage.tsx` - wrap delete/mark-read

### Accessibility (4 hours)

- [ ] Create `src/lib/a11y.ts`
  - [ ] Copy all accessibility helpers
  - [ ] Copy `AccessibleButton` component

- [ ] Update `CallPage.tsx` (1 hour)
  - [ ] Add `aria-label` to all buttons
  - [ ] Use `a11y.button.getButtonProps()` for action buttons
  - [ ] Add `title` attributes to icons
  - [ ] Add focus ring styling (`:focus-visible`)
  - [ ] Test: Tab through page, verify focus indicators

- [ ] Update `GroupChatPage.tsx` (1 hour)
  - [ ] Add `aria-label` to send button
  - [ ] Add keyboard handlers (Enter to send, Escape to cancel reply)
  - [ ] Add `aria-live="polite"` to message list for new messages
  - [ ] Mark icons with `aria-hidden="true"`
  - [ ] Test: Use keyboard only to send message

- [ ] Update `NotificationsPage.tsx` (1 hour)
  - [ ] Add `aria-checked` to select checkboxes
  - [ ] Add `aria-label` to checkboxes
  - [ ] Make notifications keyboard-navigable (role="article", tabIndex)
  - [ ] Add `aria-live="polite"` for bulk actions
  - [ ] Test: Select notifications using only keyboard

- [ ] Update `CallsPage.tsx` & `ContactsPage.tsx` (1 hour)
  - [ ] Add `aria-label` to list items
  - [ ] Add `aria-label` to action buttons
  - [ ] Test keyboard navigation on both pages

---

## 📋 WEEK 2: Type Safety & Security (Target: 5 hours)

### Type Safety (2 hours)

- [ ] Create `src/lib/schemas.ts`
  - [ ] Copy all Zod schemas
  - [ ] Copy validation helper functions
  - [ ] Install `zod` if not present: `npm install zod`

- [ ] Update `CallPage.tsx` & `CallsPage.tsx` (0.5 hours)
  - [ ] Use `CallNavigationStateSchema` with `useTypedNavigationState()`
  - [ ] Replace `as {...}` type casts
  - [ ] Test: Invalid navigation state logs error

- [ ] Update `GroupChatPage.tsx` (0.75 hours)
  - [ ] Use `MessageSchema` in `handleSend()`
  - [ ] Remove old validation logic
  - [ ] Catch `ZodError` and show specific message
  - [ ] Test: Try sending message with 5001+ characters

- [ ] Update `ContactsPage.tsx` (0.75 hours)
  - [ ] Use `PhoneContactSchema` on imported contacts
  - [ ] Use `sanitize` functions on contact data
  - [ ] Test: Import contact with special characters

### Security (3 hours)

- [ ] Create `src/lib/sanitization.ts`
  - [ ] Copy all sanitization functions
  - [ ] Install `dompurify`: `npm install dompurify`
  - [ ] Install types: `npm install --save-dev @types/dompurify`

- [ ] Update `GroupChatPage.tsx` (1.5 hours)
  - [ ] Sanitize message content before sending: `sanitize.text(input)`
  - [ ] Update `MessageSchema` to use `sanitize.html()`
  - [ ] Sanitize on display (rich text messages)
  - [ ] Test: Try sending `<img src=x onerror=alert('xss')>`
  - [ ] Verify message is sanitized and not executable

- [ ] Update `ContactsPage.tsx` (1 hour)
  - [ ] Sanitize contact names: `sanitize.username()`
  - [ ] Sanitize phone: `sanitize.phone()`
  - [ ] Sanitize email: `sanitize.email()`
  - [ ] Test: Import contact with HTML tags in name

- [ ] Update `NotificationsPage.tsx` (0.5 hours)
  - [ ] Sanitize notification title/body on display
  - [ ] Verify no HTML injection in notifications
  - [ ] Test: Trigger notification with HTML content

---

## 📋 WEEK 3: Performance & State Management (Target: 5 hours)

### Performance (3 hours)

- [ ] Update `ContactsPage.tsx` - Batch Queries (1.5 hours)
  - [ ] Add `findUsersInBatchedQueries()` from snippets
  - [ ] Replace bulk `Promise.all()` with batching function
  - [ ] Test: Measure time to sync 100 contacts (should be <2s)
  - [ ] Verify no rate limit errors in logs

- [ ] Add to `GroupChatPage.tsx` - Message List Virtualization (1.5 hours)
  - [ ] Install `react-window`: `npm install react-window`
  - [ ] Install types: `npm install --save-dev @types/react-window`
  - [ ] Wrap message list with `FixedSizeList` from `react-window`
  - [ ] Memoize `MessageItem` component: `React.memo()`
  - [ ] Test: Load 1000 messages, verify smooth scrolling

### State Management (2 hours)

- [ ] Update `GroupChatPage.tsx` - Consolidate State (2 hours)
  - [ ] Copy `groupChatReducer` from snippets
  - [ ] Replace 8+ `useState` calls with `useReducer`
  - [ ] Update all state setters to use `dispatch()`
  - [ ] Test: All features work (menu, search, reply, etc.)
  - [ ] Verify DevTools shows actions in Redux DevTools

---

## 📋 WEEK 4: Testing & Documentation (Target: 5 hours)

### Error Scenarios (1.5 hours)

- [ ] Write unit tests for error handling
  - [ ] Test `withRetry()` max retries exceeded
  - [ ] Test `getErrorMessage()` with different error types
  - [ ] Test `AppError` context is captured
  - [ ] Test: `npm test -- errorHandling.test.ts`

### Accessibility Tests (1.5 hours)

- [ ] Manual accessibility testing
  - [ ] [ ] Keyboard-only navigation works on all pages
  - [ ] [ ] Screen reader announces labels correctly
  - [ ] [ ] Tab order is logical
  - [ ] [ ] Focus indicators visible
  - [ ] [ ] Color contrast meets WCAG AA
  - [ ] Use: axe DevTools browser extension

### Documentation (1.5 hours)

- [ ] Add JSDoc to complex functions
  - [ ] Util functions in `errorHandling.ts`
  - [ ] State reducer in `groupChatReducer`
  - [ ] Custom hooks: `useCallInitialization`, etc.

- [ ] Create error recovery guide
  - [ ] Document common errors
  - [ ] Log examples for debugging
  - [ ] Recovery steps

- [ ] Set up error monitoring (1 hour)
  - [ ] Install Sentry or similar: `npm install @sentry/react`
  - [ ] Initialize in `main.tsx`
  - [ ] Test: Trigger error and verify appears in Sentry dashboard

### Performance Monitoring (1 hour)

- [ ] Add `usePerformanceMonitor` hook to slow operations
  - [ ] `ContactsPage.tsx` - contact sync
  - [ ] `GroupChatPage.tsx` - message load
  - [ ] `CallPage.tsx` - call initialization

---

## 🚀 Quick Start (First Day)

Start here to see immediate improvements:

1. **15 min**: Copy `errorHandling.ts` to `src/lib/`
2. **15 min**: Copy `a11y.ts` to `src/lib/`
3. **30 min**: Update `CallPage.tsx` with error handling (withRetry)
4. **30 min**: Update `CallPage.tsx` buttons with ARIA labels
5. **Run**: `npm run dev` and test manually
6. **Verify**: Call works with retry, keyboard navigation works

**Expected result**: CallPage is more robust and accessible! 🎉

---

## ✅ Validation Checklist (Do this before commit)

### Error Handling
- [ ] All async operations have try-catch
- [ ] Errors log with `logErrorEvent()`
- [ ] User sees friendly message from `getErrorMessage()`
- [ ] Retry works (simulate offline, turn online, retry)

### Accessibility
- [ ] Tab key navigates all buttons
- [ ] Focus ring visible on all interactive elements
- [ ] ARIA labels read correctly (test with screen reader)
- [ ] Keyboard shortcuts work (Enter, Escape, etc.)

### Type Safety
- [ ] No `as {...}` type casts remain
- [ ] Zod validation catches bad input
- [ ] Error messages are specific

### Security
- [ ] No HTML injection possible
- [ ] Special characters are escaped
- [ ] DOMPurify is used on all user input

### Performance
- [ ] Large lists don't freeze UI
- [ ] Contact sync completes in <2 seconds
- [ ] No excessive re-renders (check with React DevTools Profiler)

### Testing
- [ ] `npm test` passes all tests
- [ ] `npm run lint` has no errors
- [ ] `npm run build` succeeds
- [ ] Manual testing on device works

---

## 🎯 Success Metrics

### After Week 1 (Error + A11y)
- [ ] CallPage keyboard accessible ✓
- [ ] Retry logic working ✓
- [ ] WCAG AA compliance on 4+ pages ✓

### After Week 2 (Type + Security)
- [ ] No type casting in navigation ✓
- [ ] XSS attacks prevented ✓
- [ ] Validation catches bad input ✓

### After Week 3 (Performance + State)
- [ ] Contact sync <2s for 100 contacts ✓
- [ ] 1000 messages load smoothly ✓
- [ ] State management cleaner ✓

### After Week 4 (Testing + Monitoring)
- [ ] 80%+ test coverage ✓
- [ ] Errors tracked in Sentry ✓
- [ ] Performance insights available ✓

---

## 📞 Help & Questions

### Common Issues

**Q: Where do I copy files?**
A: Copy files to `src/lib/` (utilities) or `src/hooks/` (custom hooks)

**Q: Do I need to install new packages?**
A: Yes - `zod`, `dompurify`, `@types/dompurify`, optionally `react-window`

**Q: How do I test offline?**
A: Use DevTools Network tab → set to "Offline"

**Q: How do I verify accessibility?**
A: Use axe DevTools extension or WAVE browser extension

**Q: How do I see performance improvements?**
A: Use React DevTools Profiler to compare before/after

---

## 📅 Timeline Recommendation

| Week | Tasks | Hours | Priority |
|------|-------|-------|----------|
| 1 | Error + A11y | 7h | CRITICAL |
| 2 | Type + Security | 5h | HIGH |
| 3 | Performance + State | 5h | HIGH |
| 4 | Testing + Monitoring | 5h | MEDIUM |

**Total**: ~22 hours over 4 weeks

**ROI**: 10x improvement in production reliability + user satisfaction
