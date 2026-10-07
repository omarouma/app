-- Remove obsolete privileged RPC entry points from app-facing roles.
-- Current Android code never calls these functions directly. They are trigger,
-- housekeeping, compatibility, or server helpers. service_role retains access.

revoke execute on function public._gaga_anon_key() from public, anon, authenticated;
revoke execute on function public.check_message_rate_limit(uuid) from public, anon, authenticated;
revoke execute on function public.cleanup_disappearing_messages() from public, anon, authenticated;
revoke execute on function public.cleanup_phase4_housekeeping() from public, anon, authenticated;
revoke execute on function public.cleanup_stale_typing() from public, anon, authenticated;
revoke execute on function public.deliver_scheduled_messages() from public, anon, authenticated;
revoke execute on function public.notify_new_message() from public, anon, authenticated;
revoke execute on function public.send_call_push(text,text,boolean,text,text,text,bigint) from public, anon, authenticated;
revoke execute on function public.send_call_cancel_push(text) from public, anon, authenticated;
revoke execute on function public.claim_idempotency_key(text,text,text) from public, anon, authenticated;
revoke execute on function public.complete_idempotency_key(text,jsonb) from public, anon, authenticated;

grant execute on function public._gaga_anon_key() to service_role;
grant execute on function public.check_message_rate_limit(uuid) to service_role;
grant execute on function public.cleanup_disappearing_messages() to service_role;
grant execute on function public.cleanup_phase4_housekeeping() to service_role;
grant execute on function public.cleanup_stale_typing() to service_role;
grant execute on function public.deliver_scheduled_messages() to service_role;
grant execute on function public.send_call_push(text,text,boolean,text,text,text,bigint) to service_role;
grant execute on function public.send_call_cancel_push(text) to service_role;
grant execute on function public.claim_idempotency_key(text,text,text) to service_role;
grant execute on function public.complete_idempotency_key(text,jsonb) to service_role;
