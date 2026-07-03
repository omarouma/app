# GaGa Chat - Comprehensive Production Review
## Findings & Critical Bugs Report

**Review Date:** 2026-06-24
**Scope:** 29 source files (Stores, Pages, Views, Components, App Router)
**Objective:** Audit for functional bugs, missing imports, undefined variables, incorrect function signatures, missing `isFirestoreAvailable()` guards, incorrect Firestore paths, `navigate()` route mismatches, and memory leaks.

---

## 1. CRITICAL RUNTIME ERRORS (Will Crash App)

### 1.1 `CallsPage.tsx` - Destructuring Non-Existent Property (`calls`)
**File:** `src/pages/CallsPage.tsx` (Line 19)
**Bug:** The component destructures `calls` from `useCallStore()`, but the store only exports a `history` property. This causes `calls` to be `undefined`, and `calls.filter(...)` will throw a `TypeError`.
```typescript
// BROKEN CODE
const { calls, subscribeCalls } = useCallStore();
// CORRECT CODE
const { history, subscribeCalls } = useCallStore();
```

### 1.2 `ChatInfoPage.tsx` - Incorrect Firestore Path for `handleClearChat`
**File:** `src/pages/ChatInfoPage.tsx` (Lines 140-141)
**Bug:** The function queries the top-level `'messages'` collection and attempts a `batchDelete` on it. However, messages in this app are stored as **subcollections** under `chats/{chatId}/messages`. The `queryCollection` will return empty results, and `batchDelete` will fail silently or produce inconsistent data because the collection path `'messages'` is incorrect.
```typescript
// BROKEN CODE
const messages = await queryCollection('messages', [where('chatId', '==', chatId)]);
await batchDelete(messages.map((m: any) => ({ collection: 'messages', docId: m.id })));
// CORRECT CODE
const { querySubcollection, deleteSubcollectionDoc } = await import('@/lib/firestore');
const msgs = await querySubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, []);
for (const msg of msgs) {
  await deleteSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, msg.id);
}
```

### 1.3 `ChatRoomPage.tsx` - Array Mutation Before Chat ID Construction
**File:** `src/pages/ChatRoomPage.tsx` (Line 78)
**Bug:** `.sort()` mutates the array in-place. If the array is referenced elsewhere or if the sort logic is expected to be pure, this can cause unpredictable side effects. It should be cloned before sorting.
```typescript
// BROKEN CODE
const participants = [user.id, userId].sort();
// CORRECT CODE
const participants = [user.id, userId].slice().sort();
```

---

## 2. MISSING `isFirestoreAvailable()` GUARDS (Offline Degradation Failures)

Given the explicit requirement to handle Firebase billing issues gracefully, the following methods lack the necessary guard. If Firestore is unavailable, these will throw unhandled exceptions or hang.

### 2.1 `useChatStore.ts` (Missing Guards on Most Methods)
- **`subscribeChats`**: Lacks guard at entry. Will throw if `queryCollection` is called on an offline DB.
- **`sendMessage`**: Lacks guard. Will attempt to create/read docs and crash.
- **`editMessage`**: Lacks guard.
- **`deleteMessage`**: Lacks guard.
- **`deleteForEveryone`**: Lacks guard.
- **`addReaction`**: Lacks guard. Also inefficiently queries `limit(50)` messages to find one by ID instead of targeting the specific document.
- **`markAsRead`**: Lacks guard.
- **`createDirectChat`**: Lacks guard.
- **`loadOlderMessages`**: Lacks guard.
- **`muteChat`**: Lacks guard.
- **`updateChat`**: Lacks guard.
- **`removeParticipant`**: Lacks guard.
- **`promoteAdmin`**: Lacks guard.
- **`demoteAdmin`**: Lacks guard.
- **`clearChat`**: Lacks guard.
- **`leaveGroup`**: Lacks guard.
- **`addParticipant`**: Lacks guard.
- **`sendPoll`**: Lacks guard.
- **`votePoll`**: Lacks guard.
- **`pinMessage` / `unpinMessage`**: Lacks guard.
- **`archiveChat` / `unarchiveChat`**: Lacks guard.
- **`lockChat` / `unlockChat`**: Correctly has guard. ✅
- **`sendContactCard`**: Correctly has guard. ✅
- **`exportChat`**: Correctly has guard. ✅
- **`getSharedMedia`**: Correctly has guard. ✅

### 2.2 `useFriendStore.ts` (Missing Guards on Most Methods)
- **`subscribeFriends`**: Lacks guard.
- **`sendRequest`**: Lacks guard.
- **`acceptRequest`**: Lacks guard.
- **`rejectRequest`**: Lacks guard.
- **`cancelRequest`**: Lacks guard.
- **`toggleFavorite`**: Lacks guard.
- **`removeFriend`**: Lacks guard.
- **`blockUser`**: Lacks guard. Also downloads **ALL** `FRIEND_REQUESTS` without filters and iterates in JS, which is highly inefficient and expensive.
- **`unblockUser`**: Lacks guard. Also downloads **ALL** `BLOCKED_USERS` without filters.
- **`reportUser`**: Lacks guard. Uses raw string `'userReports'` instead of `COLLECTIONS` constant.
- **`getUserById`**: Lacks guard.
- **`getFriendStatus`**: Lacks guard.
- **`getMutualFriendsCount`**: Lacks guard.
- **`getSuggestedFriends`**: Lacks guard.
- **`getSentRequests`**: Lacks guard.
- **`getBlockedUsers`**: Lacks guard.
- **`checkPrivacyBeforeSend`**: Lacks guard.
- **`getRecentContacts`**: Lacks guard.
- **`followUser` / `unfollowUser`**: Lacks guard.
- **`toggleCloseFriend`**: Lacks guard.
- **`getFollowers` / `getFollowing`**: Lacks guard.
- **`createBroadcastList`**: Lacks guard. Uses raw string `'broadcast_lists'` instead of `COLLECTIONS` constant.
- **`getBroadcastLists`**: Lacks guard. Uses raw string `'broadcast_lists'`.
- **`deleteBroadcastList`**: Lacks guard. Uses raw string `'broadcast_lists'`.
- **`setGroupAddPrivacy`**: Lacks guard.
- **`getGroupAddPrivacy`**: Lacks guard.

### 2.3 `useWalletStore.ts` (Missing Guards on Transaction Methods)
- **`subscribeWallet`**: Lacks guard at entry. Will throw if `getDocById` fails.
- **`earnCoins`**: Lacks guard.
- **`deposit`**: Lacks guard.
- **`withdraw`**: Lacks guard.
- **`convert`**: Lacks guard.
- **`sendFromChat`**: Lacks guard. Uses `runDbTransaction` which will throw if DB is unavailable.
- **`sendP2P`**: Lacks guard. Uses `runDbTransaction` which will throw if DB is unavailable.
- **`requestMoney`**: Lacks guard.
- **`splitBill`**: Lacks guard.
- **`redeemCode`**: Lacks guard.
- **`claimDailyInterest`**: Lacks guard.
- **`setWalletPin`**: Only writes to `localStorage`, so this is safe. ✅
- **`verifyPin`**: Only reads from `localStorage`, safe. ✅

### 2.4 `ProfilePage.tsx`
- **`fetchPosts`**: Has guard inside. ✅
- **Real-time profile sync**: Checks `isFirestoreAvailable()` at line 123. ✅
- **`handleSave`**: Has guard inside. ✅
- **`handleAvatarUpload`**: Has guard inside. ✅

### 2.5 `QRScannerPage.tsx`
- **`handleFallbackScan`**: Checks `isFirestoreAvailable()` at line 315, but if it falls into the `else` block (line 331) where `!user`, it does not guard the `updateDoc` call properly. Also, the `doc` and `updateDoc` are imported directly from `firebase/firestore` at the module level, which will fail if the module isn't loaded, but the main issue is the lack of a guard around the `updateDoc` call if the DB is down.

---

## 3. INEFFICIENT / INCORRECT FIRESTORE QUERIES

### 3.1 `useFriendStore.blockUser` - Downloads Entire Collection
**File:** `src/store/useFriendStore.ts` (Lines 447-453)
**Bug:** Queries ALL `FRIEND_REQUESTS` with no filters (`queryCollection(COLLECTIONS.FRIEND_REQUESTS, [])`) and then iterates in JS to find matching requests. This is an O(N) scan and extremely expensive.
```typescript
// INEFFICIENT CODE
const reqs = await queryCollection(COLLECTIONS.FRIEND_REQUESTS, []);
for (const req of reqs) {
  if ((req.fromUserId === blockerId && req.toUserId === blockedId) || ...) {
    await deleteDocById(COLLECTIONS.FRIEND_REQUESTS, req.id);
  }
}
// CORRECT CODE
const reqs = await queryCollection(COLLECTIONS.FRIEND_REQUESTS, [
  where('fromUserId', 'in', [blockerId, blockedId]),
  where('toUserId', 'in', [blockerId, blockedId]),
]);
```

### 3.2 `useChatStore.addReaction` - Inefficient Message Lookup
**File:** `src/store/useChatStore.ts` (Lines 293-308)
**Bug:** Queries `limit(50)` messages to find one by ID, then updates it. Should query the specific message subcollection or use a direct path if the ID is known.
```typescript
// INEFFICIENT CODE
const msgs = await querySubcollection(COLLECTIONS.CHATS, _chatId, COLLECTIONS.MESSAGES, [limit(50)]);
const found = msgs.find((m) => m.id === messageId);
// CORRECT CODE: Use getDocById on the specific subcollection path.
```

### 3.3 `useCallStore.subscribeCalls` - Client-Side Filtering
**File:** `src/store/useCallStore.ts` (Lines 115-129)
**Bug:** Queries `limit(50)` call history without filtering by user, then filters in JS with `.slice(0, 20)`. This downloads unnecessary data.
```typescript
// INEFFICIENT CODE
const data = await queryCollection(COLLECTIONS.CALL_HISTORY, [
  orderBy('createdAt', 'desc'),
  limit(50),
]);
const filtered = (data || []).filter((d: any) => (d.caller === userId || d.callee === userId)).slice(0, 20);
// CORRECT CODE: Add a composite index query for caller/callee.
```

### 3.4 `AddFriendsPage.findNearbyUsers` - Client-Side Distance Filtering
**File:** `src/pages/AddFriendsPage.tsx` (Lines 474-503)
**Bug:** Downloads 50 random users and filters by distance in client memory. Firestore does not support native geospatial queries, but this approach is highly inefficient and will not scale. Should use a geohash library or a backend function.

---

## 4. STRING LITERALS INSTEAD OF `COLLECTIONS` CONSTANTS

Using raw strings for collection names is a maintenance risk. If the constant changes, the query will break silently.

- **`ProfilePage.tsx`**: Uses `'users'` (line 126, 159, 221, 222, 254, 265, 295) and `'posts'` (line 222, 254).
- **`ContactsPage.tsx`**: Uses `'users'` (line 55).
- **`DesktopContactsView.tsx`**: Uses `'users'` (line 37).
- **`ChatInfoPage.tsx`**: Uses `'messages'` (line 140) in the broken `handleClearChat`.
- **`useFriendStore.ts`**: Uses `'broadcast_lists'` (lines 785, 802, 817) and `'userReports'` (line 505).

---

## 5. CIRCULAR / RISKY STORE DEPENDENCIES

### 5.1 `useAuthStore` imports `useUserSettings`
**File:** `src/store/useAuthStore.ts` (Line 4)
**Bug:** `useAuthStore` imports `useUserSettings` at the module level. Inside `init()`, it calls `useUserSettings.getState().syncSettings()`. If `useUserSettings` imports `useAuthStore` in the future, this creates a circular dependency that can crash Zustand initialization.
**Mitigation:** Use dynamic import inside the `init` function.
```typescript
// CORRECT CODE
const { useUserSettings } = await import('@/store/useSettingsStore');
useUserSettings.getState().syncSettings(user.id);
```

### 5.2 `useFriendStore` imports `useChatStore`
**File:** `src/store/useFriendStore.ts` (Line 2)
**Bug:** `useFriendStore` imports `useChatStore` at the module level. Inside `acceptRequest`, it calls `useChatStore.getState().createDirectChat()`. This is a direct circular dependency risk.
**Mitigation:** Use dynamic import inside the `acceptRequest` function.

---

## 6. MEMORY LEAKS

### 6.1 `CreateReelsPage.tsx` - Unrevoked Blob URLs
**File:** `src/pages/CreateReelsPage.tsx` (Lines 19, 53, 74, 89)
**Bug:** `videoPreviewUrl` and `thumbnailUrl` are created via `URL.createObjectURL()` but are never revoked in a `useEffect` cleanup. This leaks memory every time a user selects a video or thumbnail. The `handleClear` function revokes them, but it is only called on manual clear, not on unmount.
```typescript
// FIX: Add a useEffect cleanup
useEffect(() => {
  return () => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
  };
}, [videoPreviewUrl, thumbnailUrl]);
```

---

## 7. INCORRECT FUNCTION SIGNATURES / USAGE

### 7.1 `getDailyInterestAmount` ignores parameter
**File:** `src/store/useWalletStore.ts` (Line 773)
**Bug:** The function signature is `getDailyInterestAmount(userId: string)`, but it ignores the `userId` parameter and reads from `get().wallet` which may be stale or null for the requested user.
```typescript
// BUGGY CODE
getDailyInterestAmount: (userId) => {
  const { wallet } = get(); // Ignores userId
  ...
}
```

### 7.2 `useCallStore.startCall` - Missing `isFirestoreAvailable` guard
**File:** `src/store/useCallStore.ts` (Line 45)
**Bug:** `startCall` does not check if Firestore is available before calling `addDocToCollection`. If the DB is down, the call initiation fails silently with no feedback to the user.

---

## 8. NAVIGATION / ROUTE ISSUES

### 8.1 `ProfilePage.tsx` - Navigate to `/chat/${g.id}` for Groups
**File:** `src/pages/ProfilePage.tsx` (Line 720)
**Bug:** In the "Mutual Groups" section, clicking a group navigates to `/chat/${g.id}`. The correct route for group chats is `/group/${g.id}`.
```typescript
// BROKEN CODE
onClick={() => navigate(`/chat/${g.id}`)}
// CORRECT CODE
onClick={() => navigate(`/group/${g.id}`)}
```

---

## 9. MISSING ERROR HANDLING / EDGE CASES

### 9.1 `ChatRoom.tsx` - `getFirestoreDB` and `doc` usage without guard
**File:** `src/components/features/chat/ChatRoom.tsx` (Lines 22-23, 226-228)
**Bug:** The component imports `doc` and `getDoc` directly from `firebase/firestore` and uses `getFirestoreDB()` to fetch the last seen status. If Firestore is unavailable, `getFirestoreDB()` might return `null` or throw, and the `getDoc` call will fail. There is no `try/catch` around the `getDoc` call, and no `isFirestoreAvailable()` check before attempting the read.

### 9.2 `AuthView.tsx` - `onFirebaseAuthStateChange` in `useEffect`
**File:** `src/views/AuthView.tsx` (Line 128-132)
**Bug:** The `useEffect` sets up an auth listener that navigates to `/contacts` on auth change. However, if the user is already on the auth page and logs in, this might cause a double navigation or race condition. The `generateQRSession` function also uses `serverTimestamp()` which might fail if Firestore is not initialized.

---

## 10. SUMMARY OF RECOMMENDED FIXES

| Priority | File | Issue | Fix |
|----------|------|-------|-----|
| **P0** | `CallsPage.tsx` | `calls` undefined | Change to `history` |
| **P0** | `ChatInfoPage.tsx` | Wrong Firestore path for clear chat | Use `querySubcollection` and `deleteSubcollectionDoc` |
| **P0** | `ChatRoomPage.tsx` | Array mutation | Use `.slice().sort()` |
| **P1** | `useChatStore.ts` | Missing `isFirestoreAvailable` guards | Add guard to all public methods |
| **P1** | `useFriendStore.ts` | Missing `isFirestoreAvailable` guards | Add guard to all public methods |
| **P1** | `useWalletStore.ts` | Missing `isFirestoreAvailable` guards | Add guard to `sendFromChat`, `sendP2P`, etc. |
| **P1** | `useFriendStore.ts` | Inefficient `blockUser` query | Use `where` clauses instead of downloading all docs |
| **P2** | `CreateReelsPage.tsx` | Memory leak (Blob URLs) | Add `useEffect` cleanup to revoke URLs |
| **P2** | `useAuthStore.ts` | Circular dependency risk | Use dynamic import for `useUserSettings` |
| **P2** | `useFriendStore.ts` | Circular dependency risk | Use dynamic import for `useChatStore` |
| **P2** | Multiple files | Raw string collection names | Replace with `COLLECTIONS` constants |
| **P3** | `ProfilePage.tsx` | Wrong group nav route | Change `/chat/${g.id}` to `/group/${g.id}` |
| **P3** | `useWalletStore.ts` | `getDailyInterestAmount` ignores param | Use `userId` parameter or remove it |
| **P3** | `useCallStore.ts` | Client-side filtering | Add composite index query for caller/callee |

