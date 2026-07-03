-- ============================================
-- GaGa Chat: Critical Schema Fix (FINAL v2)
-- Drops ALL existing policies first, then alters, then recreates
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Drop ALL existing policies on ALL tables (catch-all)
-- ============================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- ============================================
-- STEP 2: Drop FK constraints safely
-- ============================================

DO $$
DECLARE
  fk_name text;
BEGIN
  -- Drop FK on messages.chat_id
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  WHERE tc.table_name = 'messages'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND ccu.table_name = 'chats';
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I', fk_name);
  END IF;

  -- Drop FK on typing.chat_id
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  WHERE tc.table_name = 'typing'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND ccu.table_name = 'chats';
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.typing DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

-- ============================================
-- STEP 3: Alter ONLY columns that need text
-- ============================================

ALTER TABLE public.chats ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.messages ALTER COLUMN chat_id TYPE text USING chat_id::text;
ALTER TABLE public.typing ALTER COLUMN chat_id TYPE text USING chat_id::text;
ALTER TABLE public.friendships ALTER COLUMN id TYPE text USING id::text;

-- ============================================
-- STEP 4: Recreate FK constraints
-- ============================================

ALTER TABLE public.messages ADD CONSTRAINT messages_chat_id_fkey 
  FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;
ALTER TABLE public.typing ADD CONSTRAINT typing_chat_id_fkey 
  FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;

-- ============================================
-- STEP 5: Recreate ALL policies
-- ============================================

-- Users
CREATE POLICY "Users can read all users" ON public.users FOR SELECT TO public USING (true);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT TO public WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO public USING (auth.uid() = id);

-- Chats
CREATE POLICY "Users can read chats" ON public.chats FOR SELECT TO public USING (auth.uid() = ANY (participants));
CREATE POLICY "Users can create chats" ON public.chats FOR INSERT TO public WITH CHECK (auth.uid() = ANY (participants));
CREATE POLICY "Users can update chats" ON public.chats FOR UPDATE TO public USING (auth.uid() = ANY (participants));

-- Messages
CREATE POLICY "Users can read messages" ON public.messages FOR SELECT TO public USING (
  auth.uid() IN (
    SELECT unnest(chats.participants) FROM public.chats
    WHERE public.chats.id = public.messages.chat_id
  )
);
CREATE POLICY "Users can create messages" ON public.messages FOR INSERT TO public WITH CHECK (
  auth.uid() = sender_id AND
  auth.uid() IN (
    SELECT unnest(chats.participants) FROM public.chats
    WHERE public.chats.id = public.messages.chat_id
  )
);
CREATE POLICY "Users can update messages" ON public.messages FOR UPDATE TO public USING (auth.uid() = sender_id);

-- Friend requests
CREATE POLICY "Users can read friend requests" ON public.friend_requests FOR SELECT TO public USING (
  auth.uid() = from_user_id OR auth.uid() = to_user_id
);
CREATE POLICY "Users can create friend requests" ON public.friend_requests FOR INSERT TO public WITH CHECK (
  auth.uid() = from_user_id
);
CREATE POLICY "Users can update friend requests" ON public.friend_requests FOR UPDATE TO public USING (
  auth.uid() = from_user_id OR auth.uid() = to_user_id
);
CREATE POLICY "Users can delete friend requests" ON public.friend_requests FOR DELETE TO public USING (
  auth.uid() = from_user_id OR auth.uid() = to_user_id
);

-- Friendships
CREATE POLICY "Users can read friendships" ON public.friendships FOR SELECT TO public USING (
  auth.uid() = user_id OR auth.uid() = friend_id
);
CREATE POLICY "Users can create friendships" ON public.friendships FOR INSERT TO public WITH CHECK (
  auth.uid() = user_id OR auth.uid() = friend_id
);
CREATE POLICY "Users can delete friendships" ON public.friendships FOR DELETE TO public USING (
  auth.uid() = user_id OR auth.uid() = friend_id
);

-- Typing
CREATE POLICY "Users can read typing" ON public.typing FOR SELECT TO public USING (true);
CREATE POLICY "Users can upsert typing" ON public.typing FOR ALL TO public USING (true) WITH CHECK (true);

-- Presence
CREATE POLICY "Users can read presence" ON public.presence FOR SELECT TO public USING (true);
CREATE POLICY "Users can upsert presence" ON public.presence FOR ALL TO public USING (true) WITH CHECK (true);

-- Posts
CREATE POLICY "Users can read posts" ON public.posts FOR SELECT TO public USING (
  visibility = 'public' OR auth.uid() = user_id OR
  (visibility = 'friends' AND auth.uid() IN (
    SELECT friend_id FROM public.friendships WHERE user_id = public.posts.user_id
  ))
);
CREATE POLICY "Users can create posts" ON public.posts FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update posts" ON public.posts FOR UPDATE TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can delete posts" ON public.posts FOR DELETE TO public USING (auth.uid() = user_id);

-- Reels
CREATE POLICY "Users can read reels" ON public.reels FOR SELECT TO public USING (true);
CREATE POLICY "Users can create reels" ON public.reels FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update reels" ON public.reels FOR UPDATE TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can delete reels" ON public.reels FOR DELETE TO public USING (auth.uid() = user_id);

-- Stories
CREATE POLICY "Users can read stories" ON public.stories FOR SELECT TO public USING (
  auth.uid() = user_id OR
  auth.uid() IN (SELECT friend_id FROM public.friendships WHERE user_id = public.stories.user_id)
);
CREATE POLICY "Users can create stories" ON public.stories FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete stories" ON public.stories FOR DELETE TO public USING (auth.uid() = user_id);

-- Call history
CREATE POLICY "Users can read call history" ON public.call_history FOR SELECT TO public USING (
  auth.uid() = caller OR auth.uid() = callee OR auth.uid() = ANY (participant_ids)
);
CREATE POLICY "Users can create call history" ON public.call_history FOR INSERT TO public WITH CHECK (
  auth.uid() = caller OR auth.uid() = callee
);
CREATE POLICY "Users can update call history" ON public.call_history FOR UPDATE TO public USING (
  auth.uid() = caller OR auth.uid() = callee
);

-- Wallets
CREATE POLICY "Users can read wallets" ON public.wallets FOR SELECT TO public USING (auth.uid() = id);
CREATE POLICY "Users can create wallets" ON public.wallets FOR INSERT TO public WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update wallets" ON public.wallets FOR UPDATE TO public USING (auth.uid() = id);

-- Transactions
CREATE POLICY "Users can read transactions" ON public.transactions FOR SELECT TO public USING (
  auth.uid() = from_user_id OR auth.uid() = to_user_id
);
CREATE POLICY "Users can create transactions" ON public.transactions FOR INSERT TO public WITH CHECK (
  auth.uid() = from_user_id
);

-- Notifications (INSERT relaxed: any authenticated user can create notifications for others)
CREATE POLICY "Users can read notifications" ON public.notifications FOR SELECT TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can create notifications" ON public.notifications FOR INSERT TO public WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update notifications" ON public.notifications FOR UPDATE TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can delete notifications" ON public.notifications FOR DELETE TO public USING (auth.uid() = user_id);

-- Groups
CREATE POLICY "Users can read groups" ON public.groups FOR SELECT TO public USING (auth.uid() = ANY (members));
CREATE POLICY "Users can create groups" ON public.groups FOR INSERT TO public WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can update groups" ON public.groups FOR UPDATE TO public USING (
  auth.uid() = creator_id OR auth.uid() = ANY (admins)
);
CREATE POLICY "Users can delete groups" ON public.groups FOR DELETE TO public USING (auth.uid() = creator_id);

-- Bookmarks
CREATE POLICY "Users can read bookmarks" ON public.bookmarks FOR SELECT TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can create bookmarks" ON public.bookmarks FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete bookmarks" ON public.bookmarks FOR DELETE TO public USING (auth.uid() = user_id);

-- Hashtags
CREATE POLICY "Users can read hashtags" ON public.hashtags FOR SELECT TO public USING (true);
CREATE POLICY "Users can create hashtags" ON public.hashtags FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Users can update hashtags" ON public.hashtags FOR UPDATE TO public USING (true);

-- Blocked users
CREATE POLICY "Users can read blocked" ON public.blocked_users FOR SELECT TO public USING (auth.uid() = blocker_id);
CREATE POLICY "Users can create blocked" ON public.blocked_users FOR INSERT TO public WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users can delete blocked" ON public.blocked_users FOR DELETE TO public USING (auth.uid() = blocker_id);

-- Call signaling (WebRTC ICE candidates, SDP offer/answer)
CREATE POLICY "Anyone can read call_signaling" ON public.call_signaling FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can create call_signaling" ON public.call_signaling FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update call_signaling" ON public.call_signaling FOR UPDATE TO public USING (true);

-- QR sessions (desktop login via QR code)
CREATE POLICY "Anyone can read qr_sessions" ON public.qr_sessions FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can create qr_sessions" ON public.qr_sessions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update qr_sessions" ON public.qr_sessions FOR UPDATE TO public USING (true);

-- ============================================
-- STEP 6: Add typing.user_name
-- ============================================

ALTER TABLE public.typing ADD COLUMN IF NOT EXISTS user_name text;

COMMIT;
