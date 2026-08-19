-- SECURITY FIX: Restrict realtime signaling to the participants of each session.
-- SDP offers, answers, and ICE candidates are sensitive call metadata.

BEGIN;

-- 1. One-to-one call signaling: only caller/callee may read or write.
DROP POLICY IF EXISTS "call_signaling_select" ON public.call_signaling;
DROP POLICY IF EXISTS "call_signaling_select_participant" ON public.call_signaling;
CREATE POLICY "call_signaling_select_participant" ON public.call_signaling
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.call_history c
      WHERE c.id::text = call_signaling.call_id::text
        AND (c.caller_id::text = auth.uid()::text OR c.callee_id::text = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "call_signaling_insert" ON public.call_signaling;
DROP POLICY IF EXISTS "call_signaling_insert_participant" ON public.call_signaling;
CREATE POLICY "call_signaling_insert_participant" ON public.call_signaling
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.call_history c
      WHERE c.id::text = call_signaling.call_id::text
        AND (c.caller_id::text = auth.uid()::text OR c.callee_id::text = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "call_signaling_update" ON public.call_signaling;
DROP POLICY IF EXISTS "call_signaling_update_participant" ON public.call_signaling;
CREATE POLICY "call_signaling_update_participant" ON public.call_signaling
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.call_history c
      WHERE c.id::text = call_signaling.call_id::text
        AND (c.caller_id::text = auth.uid()::text OR c.callee_id::text = auth.uid()::text)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.call_history c
      WHERE c.id::text = call_signaling.call_id::text
        AND (c.caller_id::text = auth.uid()::text OR c.callee_id::text = auth.uid()::text)
    )
  );

-- 2. Live-stream signaling: broadcaster, sender, or addressed recipient only.
DROP POLICY IF EXISTS "live_stream_signals_select" ON public.live_stream_signals;
DROP POLICY IF EXISTS "live_stream_signals_select_participant" ON public.live_stream_signals;
CREATE POLICY "live_stream_signals_select_participant" ON public.live_stream_signals
  FOR SELECT TO authenticated
  USING (
    "from"::text = auth.uid()::text
    OR "to"::text = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.live_streams s
      WHERE s.id::text = live_stream_signals.stream_id::text
        AND s.user_id::text = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "live_stream_signals_insert" ON public.live_stream_signals;
DROP POLICY IF EXISTS "live_stream_signals_insert_participant" ON public.live_stream_signals;
CREATE POLICY "live_stream_signals_insert_participant" ON public.live_stream_signals
  FOR INSERT TO authenticated
  WITH CHECK (
    "from"::text = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.live_streams s
      WHERE s.id::text = live_stream_signals.stream_id::text
        AND (
          s.user_id::text = auth.uid()::text
          OR "to"::text = s.user_id::text
        )
    )
  );

-- 3. Voice-room signaling: only room participants/creator, sender, or recipient.
DROP POLICY IF EXISTS "voice_room_signals_select" ON public.voice_room_signals;
DROP POLICY IF EXISTS "voice_room_signals_select_participant" ON public.voice_room_signals;
CREATE POLICY "voice_room_signals_select_participant" ON public.voice_room_signals
  FOR SELECT TO authenticated
  USING (
    "from"::text = auth.uid()::text
    OR "to"::text = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.voice_rooms r
      WHERE r.id::text = voice_room_signals.room_id::text
        AND (
          r.creator_id::text = auth.uid()::text
          OR auth.uid()::text = ANY(COALESCE(r.participants, '{}'))
        )
    )
  );

DROP POLICY IF EXISTS "voice_room_signals_insert" ON public.voice_room_signals;
DROP POLICY IF EXISTS "voice_room_signals_insert_participant" ON public.voice_room_signals;
CREATE POLICY "voice_room_signals_insert_participant" ON public.voice_room_signals
  FOR INSERT TO authenticated
  WITH CHECK (
    "from"::text = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.voice_rooms r
      WHERE r.id::text = voice_room_signals.room_id::text
        AND (
          r.creator_id::text = auth.uid()::text
          OR auth.uid()::text = ANY(COALESCE(r.participants, '{}'))
        )
            )
  );

COMMIT;
