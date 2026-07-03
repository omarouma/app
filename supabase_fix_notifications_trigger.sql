-- ============================================
-- Fix: Auto-create notifications via database trigger
-- This bypasses RLS because triggers run as the database owner
-- Run in Supabase Dashboard → SQL Editor
-- ============================================

-- Step 1: Delete ALL existing notification policies and recreate
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create notifications" ON public.notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update notifications" ON public.notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete notifications" ON public.notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read notifications" ON public.notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Recreate permissive policies
CREATE POLICY "Users can read notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- Step 2: Create a function that auto-creates notifications on friend_request insert
CREATE OR REPLACE FUNCTION public.create_friend_request_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name text;
BEGIN
  -- Get sender's name
  SELECT name INTO sender_name FROM public.users WHERE id = NEW.from_user_id;
  
  -- Create notification for the recipient
  INSERT INTO public.notifications (user_id, type, title, body, data, read, created_at)
  VALUES (
    NEW.to_user_id,
    'friend_request',
    'New Friend Request',
    COALESCE(sender_name, 'Someone') || ' sent you a friend request',
    jsonb_build_object('request_id', NEW.id, 'from_user_id', NEW.from_user_id),
    false,
    NOW()
  );
  
  RETURN NEW;
END;
$$;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS friend_request_notification ON public.friend_requests;

-- Create the trigger
CREATE TRIGGER friend_request_notification
  AFTER INSERT ON public.friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.create_friend_request_notification();

-- Step 3: Also fix the accept notification (when friend request is accepted, notify the sender)
CREATE OR REPLACE FUNCTION public.create_accept_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  accepter_name text;
BEGIN
  -- Only run when status changes from 'pending' to 'accepted'
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    SELECT name INTO accepter_name FROM public.users WHERE id = NEW.to_user_id;
    
    INSERT INTO public.notifications (user_id, type, title, body, data, read, created_at)
    VALUES (
      NEW.from_user_id,
      'friend_request',
      'Friend Request Accepted',
      COALESCE(accepter_name, 'Someone') || ' accepted your friend request',
      jsonb_build_object('request_id', NEW.id, 'from_user_id', NEW.to_user_id),
      false,
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friend_accept_notification ON public.friend_requests;
CREATE TRIGGER friend_accept_notification
  AFTER UPDATE ON public.friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.create_accept_notification();
