-- ============================================
-- Simple RLS Fix for Notifications (no DO $$ blocks)
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ============================================

-- 1. Drop the restrictive notification insert policy
DROP POLICY IF EXISTS "Users can create notifications" ON public.notifications;

-- 2. Create a permissive insert policy (any authenticated user can insert)
CREATE POLICY "Users can create notifications" ON public.notifications FOR INSERT WITH CHECK (true);

-- 3. Verify: check that the policy is now permissive
-- You should see: with_check = true
SELECT policyname, permissive, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'Users can create notifications';
