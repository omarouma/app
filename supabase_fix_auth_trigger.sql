-- ============================================================
-- FIX: Signup fails "Error sending confirmation email" → Login
-- always fails with "Invalid login credentials"
-- Project: alzwgikndwbecuqmlrca
-- ============================================================
-- DIAGNOSED ROOT CAUSE (confirmed via direct API test):
--   POST /auth/v1/signup returns:
--     {"code":500,"error_code":"unexpected_failure",
--      "msg":"Error sending confirmation email"}
--
--   The project has "Confirm email" ENABLED in Auth settings, but
--   Supabase is UNABLE to deliver the confirmation email (missing or
--   broken SMTP). Because the confirmation email can't be sent, signup
--   aborts with HTTP 500 and NO user is created in auth.users. Login
--   then always returns "Invalid login credentials".
--
--   The OTP / magic-link flow ALSO fails with the same 500 because it
--   also requires email delivery.
--
-- FIX (do ONE of these in the Supabase Dashboard — cannot be done via
-- the anon key / SQL for email settings):
--   https://supabase.com/dashboard/project/alzwgikndwbecuqmlrca/auth/providers
--
--   OPTION A (fastest, recommended for launch): Disable email confirmation
--     Authentication → Providers → Email → "Confirm email" = OFF
--     → Save. Users can sign up + log in immediately.
--
--   OPTION B (production): Configure a real SMTP provider
--     Project Settings → Authentication → SMTP Settings
--     → Add Resend / SendGrid / Mailgun / SES so confirmation emails
--       actually send.
--
-- ------------------------------------------------------------------
-- IMPORTANT: The app code (AuthView.tsx / AuthContext / supabaseAuth)
-- is CORRECT. The frontend correctly surfaces the server error.
-- This is purely a Supabase project configuration issue.
-- ============================================================

-- Optional: If you prefer to keep email confirmation ON, you can make
-- the profile trigger robust (below) so that once SMTP works, signup
-- succeeds. This is defensive and safe to run regardless.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_name TEXT;
BEGIN
  meta_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    split_part(NEW.email, '@', 1)
  );
  BEGIN
    INSERT INTO public.users (id, email, name, display_name, created_at, updated_at)
    VALUES (NEW.id::text, NEW.email, meta_name, meta_name, now(), now())
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'handle_new_user: profile insert skipped (%): %', SQLERRM, NEW.email;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- DONE — After applying Option A or B in the dashboard, re-test
-- signup/login.
-- ============================================================
