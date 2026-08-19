-- Securely return the signed-in user's complete profile.
-- Public profile queries must not expose admin flags, balances, or contact data,
-- but auth bootstrap needs those fields for the current user only.

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT to_jsonb(u)
  FROM public.users AS u
  WHERE u.id = auth.uid()::text;
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
