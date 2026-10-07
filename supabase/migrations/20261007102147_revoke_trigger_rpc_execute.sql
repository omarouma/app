-- Security hardening: trigger functions must not be callable as public RPCs.
-- These functions are invoked by database triggers only. Revoking EXECUTE from
-- API-facing roles does not affect trigger execution and removes unnecessary
-- SECURITY DEFINER entry points from PostgREST.

revoke execute on function public.enforce_message_insert_rules() from public, anon, authenticated;
revoke execute on function public.gaga_notify_call_update_push() from public, anon, authenticated;
revoke execute on function public.gaga_notify_message_push() from public, anon, authenticated;
revoke execute on function public.handle_new_profile() from public, anon, authenticated;
revoke execute on function public.prevent_call_participant_boundary_changes() from public, anon, authenticated;
revoke execute on function public.prevent_client_chat_acl_changes() from public, anon, authenticated;
revoke execute on function public.prevent_client_message_boundary_changes() from public, anon, authenticated;
revoke execute on function public.update_chat_last_message() from public, anon, authenticated;
