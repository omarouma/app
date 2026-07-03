-- ============================================
-- GaGa Chat: Add user_name to typing table
-- Run in: https://app.supabase.com/project/xqeriudcoozuvcmzniow
-- ============================================

alter table public.typing add column if not exists user_name text;

-- Update typing RLS policy to allow upsert with user_name
alter publication supabase_realtime add table public.typing;
