-- 20260919001300_harden_push_functions.sql
--
-- Security hardening for three SECURITY DEFINER functions that were flagged
-- by the Supabase linter:
--   * notify_new_message()          (trigger function)
--   * send_call_push(...)           (callable RPC -> net.http_post)
--   * send_call_cancel_push(...)    (callable RPC -> net.http_post)
--
-- Issues:
--   1. None pinned `search_path`, so a malicious caller could shadow objects
--      resolved inside the function body (privilege-escalation risk).
--   2. send_call_push / send_call_cancel_push were EXECUTE-able by `anon` and
--      PUBLIC. Because they perform outbound HTTP POSTs to the FCM push
--      endpoint, an unauthenticated caller could spam arbitrary users with
--      push notifications. They are only ever invoked from trusted server
--      contexts, so we revoke anon/PUBLIC and grant only authenticated +
--      service_role.

-- 1. Pin search_path on all three.
ALTER FUNCTION public.notify_new_message() SET search_path = public, pg_temp;
ALTER FUNCTION public.send_call_push(text, text, boolean, text, text, text, bigint) SET search_path = public, pg_temp;
ALTER FUNCTION public.send_call_cancel_push(text) SET search_path = public, pg_temp;

-- 2. Lock down EXECUTE on the outbound-HTTP push RPCs.
REVOKE ALL ON FUNCTION public.send_call_push(text, text, boolean, text, text, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_call_cancel_push(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_call_push(text, text, boolean, text, text, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_call_cancel_push(text) TO authenticated, service_role;

-- notify_new_message is a trigger function; it should never be called directly.
REVOKE ALL ON FUNCTION public.notify_new_message() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_new_message() TO service_role;
