-- Remove exact duplicate indexes reported by Supabase Performance Advisor.
-- Constraint-backed indexes are retained; only redundant standalone copies are dropped.

drop index if exists public.idx_call_history_callee;
drop index if exists public.idx_call_history_caller;
drop index if exists public.idx_call_signaling_call;
drop index if exists public.idx_friendships_user;
drop index if exists public.friendships_user_friend_uq;
drop index if exists public.idx_messages_chat_created;
drop index if exists public.idx_notifications_user_created;
drop index if exists public.idx_presence_user;
drop index if exists public.idx_security_events_user_created;
drop index if exists public.idx_typing_chat;
drop index if exists public.uq_user_devices_user_device;
drop index if exists public.idx_wallet_tx_user_id;
drop index if exists public.wallets_id_uq;
