-- Cover foreign keys reported by Supabase Performance Advisor.
create index if not exists idx_gaga_daily_contributions_owner_id on public.gaga_daily_contributions(owner_id);
create index if not exists idx_gaga_message_requests_chat_id on public.gaga_message_requests(chat_id);
create index if not exists idx_notifications_from_id on public.notifications(from_id);
create index if not exists idx_qr_sessions_scanned_by on public.qr_sessions(scanned_by);
create index if not exists idx_qr_sessions_user_id on public.qr_sessions(user_id);
create index if not exists idx_saved_messages_chat_id on public.saved_messages(chat_id);
create index if not exists idx_saved_messages_message_id on public.saved_messages(message_id);
create index if not exists idx_typing_user_id on public.typing(user_id);
create index if not exists idx_user_reports_reporter_id on public.user_reports(reporter_id);
create index if not exists idx_wallet_transactions_related_user_id on public.wallet_transactions(related_user_id);
