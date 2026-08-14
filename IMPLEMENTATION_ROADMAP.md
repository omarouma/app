# 🚀 GaGa Chat - Production Implementation Roadmap

**Status**: Production App on Firebase Hosting | Needs Critical Fixes Before Scaling
**Timeline**: 2-3 weeks | Phased rollout to minimize user impact
**Risk Level**: HIGH (3 P0 issues can cause data corruption)

---

## 📋 Executive Overview

This document provides:
1. **Week-by-week implementation plan** with dependencies
2. **Detailed code changes** for each critical fix
3. **Testing strategy** (unit → integration → staging → production)
4. **Deployment checkpoints** with rollback procedures
5. **Monitoring & verification** metrics post-deploy

**Critical Path**: UUID fix → RLS fix → Store refactor → Tests → Deploy

---

## ⚠️ Risk Assessment

### Current Production Risks

| Issue | Impact | Risk | Likelihood |
|-------|--------|------|------------|
| Message ID collisions | Data loss/merge | CRITICAL | MEDIUM (high message volume) |
| RLS permission gap | Security breach | CRITICAL | HIGH (if users attempt) |
| Store race conditions | Message delays/failures | HIGH | MEDIUM |
| No tests | Regressions after changes | HIGH | HIGH |
| Type safety gaps | Runtime errors | MEDIUM | MEDIUM |

**Action**: Fix P0 issues BEFORE high-traffic periods (weekends, evenings)

---

## 📅 Phased Implementation Schedule

```
┌─────────────────────────────────────────────────────────────┐
│ WEEK 1: Critical Fixes (Minimal User Impact)               │
├─────────────────────────────────────────────────────────────┤
│ Day 1-2: UUID Message IDs (1-2 hrs)                        │
│ Day 3-4: RLS Permission Fix (2-3 hrs)                      │
│ Day 5: Staging deploy + smoke tests                        │
│ Day 5: Production deploy (evening, low traffic)            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ WEEK 2: Type Safety & Validation (Backward Compatible)     │
├─────────────────────────────────────────────────────────────┤
│ Day 1-2: Enable TypeScript Strict Mode (4-6 hrs)           │
│ Day 3-4: Add Zod Schemas (3-4 hrs)                         │
│ Day 5: Staging deploy + type coverage tests                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ WEEK 3: Testing & Store Refactor (Staging Only)            │
├─────────────────────────────────────────────────────────────┤
│ Day 1-2: Set up Vitest (2-3 hrs)                           │
│ Day 3-5: Write 40 tests (10-12 hrs)                        │
│ Day 6-7: Store I/O refactor (6-8 hrs) - STAGING ONLY      │
│ Final: Performance audit & load testing                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔴 WEEK 1: Critical Fixes (High Priority)

### FIX #1: UUID Message IDs

**File**: `src/store/useChatStore.ts`
**Current Code** (lines ~150-180):
```typescript
export const useChatStore = create<ChatStore>((set, get) => ({
  // ...
  sendMessage: async (payload: SendMessagePayload) => {
    const tempId = `${Date.now()}`;  // ❌ NOT UNIQUE
    // Optimistic update
    set(state => ({
      messages: [...state.messages, {
        id: tempId,
        ...payload
      }]
    }));
    // Send to DB
    const docId = await supabaseDb.insertWithFallback('messages', payload);
    // Update with real ID
    set(state => ({
      messages: state.messages.map(m => 
        m.id === tempId ? { ...m, id: docId } : m
      )
    }));
  }
}));
```

**Implementation Guide**:

1. **Install UUID library**:
```bash
npm install uuid
npm install --save-dev @types/uuid
```

2. **Update store** (Complete replacement for sendMessage action):
```typescript
import { v4 as uuidv4 } from 'uuid';

export const useChatStore = create<ChatStore>((set, get) => ({
  // ... other actions ...
  
  sendMessage: async (payload: SendMessagePayload) => {
    // Generate UUID locally (guaranteed unique + deterministic for sorting)
    const tempId = uuidv4();
    const now = Date.now();
    
    // Add message state tracking
    const optimisticMessage = {
      id: tempId,
      ...payload,
      created_at: now,
      delivery_status: 'optimistic' as const, // Add this field
      failed_attempts: 0
    };
    
    // Optimistic update with new field
    set(state => ({
      messages: [...state.messages, optimisticMessage],
      // Track temp IDs for rollback
      pendingMessageIds: [...(state.pendingMessageIds || []), tempId]
    }));
    
    try {
      // Send to DB with metadata
      const docId = await supabaseDb.insertWithFallback('messages', {
        ...payload,
        created_at: now,
        delivery_status: 'sent'
      });
      
      // Update with real ID and confirmation
      set(state => ({
        messages: state.messages.map(m => 
          m.id === tempId 
            ? { ...m, id: docId, delivery_status: 'delivered' as const } 
            : m
        ),
        pendingMessageIds: state.pendingMessageIds?.filter(id => id !== tempId) || []
      }));
      
      return { success: true, id: docId };
    } catch (error) {
      // Rollback on error
      set(state => ({
        messages: state.messages.map(m => 
          m.id === tempId 
            ? { ...m, delivery_status: 'failed' as const, failed_attempts: (m.failed_attempts || 0) + 1 }
            : m
        ),
        // Keep in pending for retry
        lastError: { message: error.message, timestamp: Date.now() }
      }));
      
      throw error;
    }
  },
  
  // Add retry handler
  retryFailedMessage: async (tempId: string) => {
    const state = get();
    const failedMsg = state.messages.find(m => m.id === tempId);
    
    if (!failedMsg || failedMsg.delivery_status !== 'failed') {
      throw new Error('Message not in failed state');
    }
    
    // Retry the send
    return await useChatStore.getState().sendMessage({
      chat_id: failedMsg.chat_id,
      sender_id: failedMsg.sender_id,
      content: failedMsg.content
    });
  }
}));
```

3. **Update message types** in `src/types/index.ts`:
```typescript
export interface Message {
  id: string; // UUID, not Date.now()
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: number; // Timestamp
  delivery_status?: 'optimistic' | 'sending' | 'sent' | 'delivered' | 'failed';
  failed_attempts?: number;
  // ... other fields
}

export interface ChatStore {
  // ... existing ...
  messages: Message[];
  pendingMessageIds?: string[]; // Track unsent UUIDs
  sendMessage: (payload: SendMessagePayload) => Promise<{ success: boolean; id: string }>;
  retryFailedMessage: (tempId: string) => Promise<{ success: boolean; id: string }>;
}
```

4. **Update components that reference message IDs**:
```typescript
// In components, use consistent UUID format
const handleDeleteMessage = useCallback(async (messageId: string) => {
  // messageId is now always UUID format
  await supabaseDb.deleteDoc('messages', messageId);
}, []);
```

5. **Database migration** (optional but recommended):
```sql
-- Add delivery_status column if not exists
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) DEFAULT 'sent';

-- Create index for faster lookups of pending messages
CREATE INDEX IF NOT EXISTS idx_messages_delivery_status 
ON messages (chat_id, delivery_status) 
WHERE delivery_status IN ('sending', 'failed');
```

**Testing Strategy**:
```typescript
describe('sendMessage UUID', () => {
  it('should generate unique UUIDs for rapid sends', async () => {
    const promises = Array(100).fill(null).map(() => 
      useChatStore.getState().sendMessage({
        chat_id: 'test',
        sender_id: 'user1',
        content: 'test'
      })
    );
    
    const results = await Promise.all(promises);
    const ids = new Set(results.map(r => r.id));
    expect(ids.size).toBe(100); // All unique
  });
  
  it('should rollback on send failure', async () => {
    const store = useChatStore.getState();
    const initialCount = store.messages.length;
    
    // Mock failure
    jest.spyOn(supabaseDb, 'insertWithFallback').mockRejectedOnce(new Error('Network error'));
    
    try {
      await store.sendMessage({ chat_id: 'test', sender_id: 'user1', content: 'test' });
    } catch (e) {}
    
    const failed = store.messages[store.messages.length - 1];
    expect(failed.delivery_status).toBe('failed');
    expect(store.pendingMessageIds).toContain(failed.id);
  });
});
```

**Deployment Checkpoint**:
- [ ] All message IDs in staging are UUIDs
- [ ] No collisions detected in logs
- [ ] Delivery status tracking working
- [ ] Retry mechanism tested
- [ ] No performance regression

---

### FIX #2: RLS Message Update Policy

**File**: `supabase_full_setup.sql`
**Current Gap** (lines ~220-260):
```sql
-- ❌ CURRENT - TOO PERMISSIVE
CREATE POLICY "messages_participant_update" ON messages
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chats 
    WHERE id = messages.chat_id 
    AND auth.uid()::text = ANY(participants)
  ))
  WITH CHECK ((auth.uid()::text = sender_id) OR (recipient can update read_at));
```

**Implementation Guide**:

1. **Create new RLS policies** (Drop old ones first):
```sql
-- Remove old permissive policy
DROP POLICY IF EXISTS "messages_participant_update" ON messages;
DROP POLICY IF EXISTS "messages_update" ON messages;
DROP POLICY IF EXISTS "messages_delete" ON messages;

-- POLICY 1: Only sender can update their own message content
CREATE POLICY "messages_sender_can_update_content" ON messages
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = sender_id)
  WITH CHECK (auth.uid()::text = sender_id);

-- POLICY 2: Chat participants can only mark messages as read (specific columns)
-- Note: This uses row-level update but restricts which columns can change
CREATE POLICY "messages_recipient_mark_read" ON messages
  FOR UPDATE TO authenticated
  USING (
    -- Recipient must be a participant in the chat
    auth.uid()::text != sender_id AND
    EXISTS (
      SELECT 1 FROM chats 
      WHERE id = messages.chat_id 
      AND auth.uid()::text = ANY(participants)
    )
  )
  WITH CHECK (
    -- Can ONLY update read-related columns, not content
    auth.uid()::text != sender_id AND
    content IS NOT DISTINCT FROM OLD.content AND
    sender_id IS NOT DISTINCT FROM OLD.sender_id AND
    chat_id IS NOT DISTINCT FROM OLD.chat_id
  );

-- POLICY 3: Sender can mark own message as read (if they need to)
CREATE POLICY "messages_sender_mark_read" ON messages
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = sender_id)
  WITH CHECK (
    auth.uid()::text = sender_id AND
    sender_id IS NOT DISTINCT FROM OLD.sender_id
  );

-- POLICY 4: Only sender can delete their messages (add if not exists)
CREATE POLICY IF NOT EXISTS "messages_sender_delete" ON messages
  FOR DELETE TO authenticated
  USING (auth.uid()::text = sender_id);

-- POLICY 5: Participants can read
CREATE POLICY IF NOT EXISTS "messages_read" ON messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chats 
    WHERE id = messages.chat_id 
    AND auth.uid()::text = ANY(participants)
  ));

-- POLICY 6: Sender can insert new messages
CREATE POLICY IF NOT EXISTS "messages_insert" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = sender_id);
```

2. **Add database constraints** (Belt-and-suspenders approach):
```sql
-- Add trigger to prevent unauthorized updates
CREATE OR REPLACE FUNCTION prevent_message_tampering()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow sender to modify message content
  IF auth.uid()::text != OLD.sender_id THEN
    -- Raise an exception if trying to change content
    IF NEW.content IS DISTINCT FROM OLD.content THEN
      RAISE EXCEPTION 'Only message sender can modify content';
    END IF;
    -- Raise an exception if trying to change sender
    IF NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN
      RAISE EXCEPTION 'Cannot change message sender';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS prevent_message_tampering_trigger ON messages;

-- Create new trigger
CREATE TRIGGER prevent_message_tampering_trigger
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION prevent_message_tampering();
```

3. **Test RLS policies** (Create test file):
```typescript
// src/__tests__/rls.test.ts
import { createClient } from '@supabase/supabase-js';

const testRLS = async () => {
  // User 1 sends message
  const user1 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    headers: { 'x-client-info': 'test' }
  });
  
  const msg = await user1
    .from('messages')
    .insert({ chat_id: 'chat1', sender_id: 'user1', content: 'hello' });
  
  const messageId = msg.data[0].id;
  
  // User 2 tries to update content (should fail)
  const user2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    headers: { 'x-client-info': 'test' }
  });
  
  const unauthorizedUpdate = await user2
    .from('messages')
    .update({ content: 'hacked!' })
    .eq('id', messageId);
  
  // Should throw or return 0 rows updated
  expect(unauthorizedUpdate.error || unauthorizedUpdate.data.length === 0).toBe(true);
  
  // User 1 CAN update their own message
  const authorizedUpdate = await user1
    .from('messages')
    .update({ content: 'edited' })
    .eq('id', messageId);
  
  expect(authorizedUpdate.error).toBeFalsy();
};
```

4. **Database migration commands**:
```bash
# Backup current data
pg_dump $DATABASE_URL > backup_before_rls_fix.sql

# Connect to Supabase and run the SQL file
supabase db push --dry-run  # Check what will change

# Apply changes
supabase db push

# Verify RLS is working
supabase functions deploy verify-rls

# Run tests
npm run test -- rls.test.ts
```

**Deployment Checkpoint**:
- [ ] Old permissive policies dropped
- [ ] New granular policies created
- [ ] Trigger prevents tampering
- [ ] RLS test passes
- [ ] No performance regression (check query times)
- [ ] Existing legitimate reads still work

---

## 🟡 WEEK 2: Type Safety & Validation

### FIX #3: Enable TypeScript Strict Mode

**File**: `tsconfig.json`
**Changes**:
```json
{
  "compilerOptions": {
    // Existing options...
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true
  }
}
```

**Expected type errors to fix** (in order of frequency):
1. `unknown` → specific types (150-200 locations)
2. Missing null checks (50-80 locations)
3. Implicit `any` in function signatures (30-50 locations)
4. Untyped callbacks (20-30 locations)

**Estimated time**: 4-6 hours
**Testing**: Run `tsc --noEmit` after each fix

---

### FIX #4: Add Zod Input Validation

**File**: Create `src/lib/validation.ts`
```typescript
import { z } from 'zod';

export const SendMessageSchema = z.object({
  chat_id: z.string().uuid(),
  sender_id: z.string().uuid(),
  content: z.string().min(1).max(4000),
  type: z.enum(['text', 'media', 'voice']).optional(),
  media_url: z.string().url().optional(),
  reply_to_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const CreateChatSchema = z.object({
  participant_ids: z.array(z.string().uuid()).min(2),
  name: z.string().optional(),
  is_group: z.boolean().optional(),
  is_broadcast: z.boolean().optional(),
});

export const UpdateProfileSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  bio: z.string().max(500).optional(),
  avatar_url: z.string().url().optional(),
});

// ... more schemas
```

**Integration in store**:
```typescript
sendMessage: async (payload: unknown) => {
  // Validate before proceeding
  const validated = SendMessageSchema.parse(payload);
  // Now 'validated' is fully typed
  return await sendMessageAPI(validated);
},
```

---

## 🟢 WEEK 3: Testing & Performance

### FIX #5: Set Up Vitest

**Setup**:
```bash
npm install --save-dev vitest @vitest/ui @testing-library/react @testing-library/jest-dom
```

**File**: `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/__tests__/']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Write 40 core tests** (priority order):
```typescript
describe('useChatStore - Message Delivery', () => {
  it('should send message with valid UUID', () => { /* ... */ });
  it('should track delivery status progression', () => { /* ... */ });
  it('should rollback on network error', () => { /* ... */ });
  it('should retry failed messages', () => { /* ... */ });
  it('should handle rapid message sends without collisions', () => { /* ... */ });
});

describe('useChatStore - Subscriptions', () => {
  it('should subscribe to chat messages', () => { /* ... */ });
  it('should cleanup subscriptions on unmount', () => { /* ... */ });
  it('should deduplicate subscriptions', () => { /* ... */ });
});

describe('RLS Policies', () => {
  it('should prevent non-sender from updating message content', () => { /* ... */ });
  it('should allow recipient to mark message read', () => { /* ... */ });
  it('should prevent unauthorized chat access', () => { /* ... */ });
});

// ... 30 more tests
```

---

## 📊 Deployment Checklist

### Pre-Deployment Verification

```markdown
## WEEK 1 - Critical Fixes

- [ ] UUID Message IDs
  - [ ] npm install uuid
  - [ ] Update useChatStore.ts
  - [ ] Update Message type interface
  - [ ] Test rapid sends (100+ messages)
  - [ ] Verify no collisions in logs
  - [ ] Deploy to staging (full 8 hours monitoring)
  - [ ] Deploy to production (evening, low traffic)
  - [ ] Monitor error rates (expect 0% increase)
  - [ ] Monitor latency (expect no change or improvement)
  - [ ] Rollback plan: Revert store to use UUID lib as fallback

- [ ] RLS Message Update Policy
  - [ ] Backup production database
  - [ ] Run new SQL policies in staging
  - [ ] Test RLS enforcement (test_rls.ts)
  - [ ] Verify existing chats still work
  - [ ] Deploy to production
  - [ ] Monitor unauthorized access attempts (logs)
  - [ ] Rollback plan: Restore old policies + test read/write access

## WEEK 2 - Type Safety

- [ ] TypeScript Strict Mode
  - [ ] Enable strict: true in tsconfig.json
  - [ ] Run tsc --noEmit
  - [ ] Fix type errors in batches (unknown → specific types)
  - [ ] Verify build passes locally
  - [ ] Deploy to staging
  - [ ] Run full test suite (40+ tests)

- [ ] Zod Validation
  - [ ] Create src/lib/validation.ts
  - [ ] Add schemas for all API payloads
  - [ ] Integrate into stores
  - [ ] Test with invalid inputs
  - [ ] Deploy to staging then production

## WEEK 3 - Testing

- [ ] Vitest Setup
  - [ ] npm install vitest and dependencies
  - [ ] Create vitest.config.ts
  - [ ] Write 40 core tests
  - [ ] Achieve 40% code coverage
  - [ ] All tests pass in CI

## Final Pre-Production

- [ ] Performance Testing
  - [ ] Build size check (expect < 2MB gzipped)
  - [ ] Load test with 100+ concurrent users
  - [ ] Message send/receive latency < 500ms
  - [ ] No memory leaks (heap snapshot analysis)

- [ ] Security Audit
  - [ ] No console.log of sensitive data
  - [ ] API keys in .env only
  - [ ] RLS policies enforced
  - [ ] Input validation on all routes

- [ ] User Communication
  - [ ] Notify users of maintenance window
  - [ ] Prepare rollback documentation
  - [ ] Set up monitoring alerts
  - [ ] Have ops team on standby

## Production Deployment

- [ ] Staging ✅ passed all tests
- [ ] Build successful (`npm run build`)
- [ ] Smoke tests pass
- [ ] Firebase deploy ready (`firebase deploy`)
- [ ] Rollback procedure documented
- [ ] Monitoring alerts active

### Rollback Procedure

If critical issue detected post-deploy:
1. Run `firebase hosting:rollback` (reverts to previous build)
2. Verify app loads and basic features work
3. Investigate issue in staging before re-deploy
4. Maximum impact: 5 minutes of downtime

### Monitoring Post-Deployment

Track these metrics for 48 hours:
- Error rate (target: 0-0.1%)
- Message delivery rate (target: 99.9%+)
- API latency (target: <500ms p95)
- CPU/Memory usage (target: normal ±10%)
- User session duration (target: no decline)
```

---

## 🔄 Git Workflow for Safe Deployment

```bash
# Create feature branches for each fix
git checkout -b fix/uuid-message-ids
# ... make changes ...
git commit -m "fix: use UUID for message IDs instead of Date.now()"
git push origin fix/uuid-message-ids
# Create PR → Code review → Merge to staging branch

# Staging branch for testing
git checkout staging
git merge fix/uuid-message-ids
npm run build
firebase deploy --only hosting:staging  # If you have staging project

# After 24-48 hour testing in staging
git checkout main
git merge staging
git tag v2.0.1  # Semantic versioning
npm run build
firebase deploy  # Production
```

---

## 📞 Monitoring & Alerts (Post-Deployment)

Set up Firebase monitoring:

```javascript
// Add to src/services/monitoring.ts
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  integrations: [
    new Sentry.Replay({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});

// Track message delivery
export const trackMessageDelivery = (status: 'sent' | 'delivered' | 'failed') => {
  Sentry.captureMessage(`Message delivery: ${status}`, 'info');
};

// Track RLS violations
export const trackRLSViolation = (action: string, resource: string) => {
  Sentry.captureMessage(`RLS violation attempt: ${action} on ${resource}`, 'warning');
};
```

Configure alerts in Firebase Console:
- Alert on 5%+ increase in error rate
- Alert on message delivery failures > 1%
- Alert on RLS violation patterns

---

## ✅ Success Criteria

**After completing this roadmap, the app should have:**

1. ✅ No message ID collisions (UUID tracking)
2. ✅ RLS policies enforced (no unauthorized updates)
3. ✅ 100% type safety (strict mode enabled)
4. ✅ Input validation (all payloads validated)
5. ✅ 40% test coverage (critical paths covered)
6. ✅ <500ms message latency (p95)
7. ✅ 99.9% message delivery rate
8. ✅ Zero security violations (automated checks)

**Production metrics to track:**
- Error rate: < 0.1%
- Uptime: 99.9%+
- User session quality: improved
- Message delivery: 99.9%+

---

## 🚨 Emergency Procedures

### If deployment goes wrong:

```bash
# Immediate rollback (< 5 min)
firebase hosting:rollback

# Verify rollback successful
firebase open hosting

# Investigate issue
npm run build
# Fix locally, test
npm run test

# Re-deploy only after verification
firebase deploy
```

### Critical Issue Response:

1. **Detect**: Error rate spike OR user reports
2. **Alert**: Notify team via Slack
3. **Assess**: <5 minutes to determine severity
4. **Decide**: Rollback vs. Fix forward
5. **Execute**: Deploy fix or rollback
6. **Verify**: Confirm fix resolves issue
7. **PostMortem**: Document what happened

---

## 📝 Next Steps

1. **Today**: Review this roadmap with team
2. **Tomorrow**: Start Week 1 fixes (UUID + RLS)
3. **Day 3**: Deploy to staging
4. **Day 5**: Deploy to production
5. **Week 2**: Type safety improvements
6. **Week 3**: Testing + performance
7. **Week 4**: Production monitoring

**Questions to address before starting:**
- [ ] Do we have staging environment set up?
- [ ] Is database backup automated?
- [ ] Are we monitoring error rates?
- [ ] Who is on-call during deployment?
- [ ] Do users know about maintenance window?

---

**Last Updated**: 2026-08-13
**Status**: Ready for implementation
**Estimated Completion**: 3 weeks
**Risk Level**: MANAGED (with proper staging & monitoring)
