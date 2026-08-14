# Store Refactoring Implementation Guide

## Status
The chat store refactoring to use the API layer is in progress.

### Phase 1: ✅ COMPLETE
Created `src/services/chatApi.ts` with comprehensive API layer containing:
- All Firestore operations wrapped and organized
- Message mappers (moved from store)
- Chat mappers (moved from store)  
- 40+ methods organized by concern:
  - Chat operations (fetch, create, update, archive, etc.)
  - Message operations (send, edit, delete, reactions, etc.)
  - Subscription management
  - Admin operations

### Phase 2: IN PROGRESS - Store Method Refactoring
The store still contains direct Firestore calls that need to be replaced with chatApi calls.

#### Key Methods to Refactor (Priority Order):
1. **sendMessage** - Core operation, high complexity
   - Uses UUID generation
   - Handles optimistic updates
   - Tracks pending messages
   - Offline queue integration
   
2. **retryFailedMessage** - Handles retry logic with exponential backoff

3. **Message CRUD**:
   - editMessage
   - deleteMessage
   - deleteForEveryone
   - recallMessage

4. **Chat Management**:
   - createDirectChat
   - updateChat
   - muteChat
   - toggleMuteChat
   - archiveChat / unarchiveChat

5. **Participant Management**:
   - removeParticipant
   - addParticipant
   - promoteAdmin
   - demoteAdmin
   - leaveGroup

6. **Advanced Features**:
   - sendPoll / votePoll
   - pinMessage / unpinMessage
   - sendContactCard
   - exportChat
   - getSharedMedia

#### Migration Pattern
For each method, follow this pattern:

**Before (direct Firestore):**
```typescript
editMessage: async (chatId, messageId, content) => {
  if (!isFirestoreAvailable()) return;
  try {
    await updateSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, messageId, { 
      content: sanitizeText(content), 
      edited: true 
    });
  } catch (error) {
    logStoreError('editMessage', error, { chatId, messageId });
  }
}
```

**After (using chatApi):**
```typescript
editMessage: async (chatId, messageId, content) => {
  try {
    await chatApi.editMessage(chatId, messageId, content);
    // Optimistic update if needed
    set(state => ({
      messages: {
        ...state.messages,
        [chatId]: (state.messages[chatId] || []).map(m =>
          m.id === messageId ? { ...m, content, edited: true } : m
        ),
      },
    }));
  } catch (error) {
    toast.error('Failed to edit message.');
  }
}
```

#### Benefits of This Refactoring:
✅ Separation of concerns (API layer vs state management)
✅ Easier testing (can mock chatApi)
✅ Single source of truth for API operations
✅ Future-proof for caching and optimization
✅ Reduced store file size (934 lines → ~300 lines target)
✅ Centralized error handling
✅ Better code organization

#### Next Steps:
1. Update `sendMessage` method to use `chatApi.sendMessage()`
2. Update `retryFailedMessage` to use `chatApi.retryFailedMessage()`
3. Update CRUD methods (edit, delete)
4. Update chat management methods
5. Test all operations
6. Deploy and monitor

#### Notes:
- Subscriptions (subscribeChats, subscribeMessages) don't need refactoring - they're already using the correct pattern
- Keep optimistic updates in the store where appropriate (e.g., marking message as read)
- Mappers are already moved to chatApi, so no need to define them in store
- Error handling moved to chatApi, store just needs to show toast notifications

## Implementation Started
- [x] API layer created with full Firestore wrapping
- [x] Imports updated in store to use chatApi
- [x] Fixed syntax error in archiveChat method
- [ ] sendMessage refactored
- [ ] CRUD methods refactored
- [ ] Chat management methods refactored
- [ ] Tested all operations
- [ ] Deployed to production

