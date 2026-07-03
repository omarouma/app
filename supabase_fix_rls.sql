-- ============================================
-- Fix RLS Policy for Notifications Table
-- Run in Supabase Dashboard → SQL Editor
-- ============================================

-- Fix notifications INSERT policy: allow any authenticated user to create notifications
DROP POLICY IF EXISTS "Users can create notifications" ON public.notifications;

CREATE POLICY "Users can create notifications" 
ON public.notifications 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Also fix other potentially restrictive policies

-- Friendships: allow creating friendships (both users are involved)
DROP POLICY IF EXISTS "Users can create friendships" ON public.friendships;
CREATE POLICY "Users can create friendships" 
ON public.friendships 
FOR INSERT 
WITH CHECK (auth.uid() = user_id OR auth.uid() = friend_id);

-- Transactions: allow creating transactions for the sender
DROP POLICY IF EXISTS "Users can create transactions" ON public.transactions;
CREATE POLICY "Users can create transactions" 
ON public.transactions 
FOR INSERT 
WITH CHECK (auth.uid() = from_user_id);

-- Call history: allow creating call records for participants
DROP POLICY IF EXISTS "Users can create call history" ON public.call_history;
CREATE POLICY "Users can create call history" 
ON public.call_history 
FOR INSERT 
WITH CHECK (auth.uid() = caller OR auth.uid() = callee);
