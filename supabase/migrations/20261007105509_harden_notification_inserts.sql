-- Notifications are backend-generated. The Android client only reads and
-- marks its own notifications. Removing client INSERT closes notification spam.
drop policy if exists notifications_insert_own_or_system on public.notifications;
revoke insert on table public.notifications from anon, authenticated;

-- PostgREST clients do not need TRUNCATE, REFERENCES or TRIGGER privileges.
-- RLS does not cover TRUNCATE, so remove these grants from high-value tables.
revoke truncate, references, trigger on table public.notifications from anon, authenticated;
revoke truncate, references, trigger on table public.chats from anon, authenticated;
revoke truncate, references, trigger on table public.messages from anon, authenticated;
revoke truncate, references, trigger on table public.call_history from anon, authenticated;
revoke truncate, references, trigger on table public.call_signaling from anon, authenticated;
revoke truncate, references, trigger on table public.user_devices from anon, authenticated;
revoke truncate, references, trigger on table public.wallets from anon, authenticated;
revoke truncate, references, trigger on table public.wallet_transactions from anon, authenticated;
