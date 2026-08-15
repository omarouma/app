import { useState, useRef, useCallback, useEffect } from 'react';
import { useIsMounted } from './use-mobile';
import { MAX_VOICE_SIZE } from '@/lib/storage';

/** Maximum voice recording length in seconds (keeps blobs under the 5MB voice cap). */
export const MAX_VOICE_DURATION = 60;

interface VoiceRecorderState {
  isRecording: boolean;
  duration: number;
  error: string | null;
  /** True when the recording was auto-stopped by hitting MAX_VOICE_DURATION. */
  limitReached: boolean;
}

export function useVoiceRecorder() {
  const isMounted = useIsMounted();
  const [state, setState] = useState<VoiceRecorderState>({
    isRecording: false,
    duration: 0,
    error: null,
    limitReached: false,
  });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const isRecordingRef = useRef(false);
  const limitReachedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // noop
        }
      }
      isRecordingRef.current = false;
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!isMounted) return;
    // Guard against double-start (e.g. rapid taps on the mic button).
    if (isRecordingRef.current) return;

    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (result.state === 'denied') {
        setState({ isRecording: false, duration: 0, error: 'Microphone access denied. Enable it in browser settings.', limitReached: false });
        return;
      }
    } catch {
      // permissions API not supported
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();
      isRecordingRef.current = true;
      limitReachedRef.current = false;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100);

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        if (elapsed >= MAX_VOICE_DURATION) {
          limitReachedRef.current = true;
          setState({ isRecording: false, duration: elapsed, error: null, limitReached: true });
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
          }
          return;
        }
        setState((s) => ({ ...s, duration: elapsed, isRecording: true, limitReached: false }));
      }, 1000);

      setState({ isRecording: true, duration: 0, error: null, limitReached: false });
    } catch {
      setState({ isRecording: false, duration: 0, error: 'Microphone access denied', limitReached: false });
    }
  }, [isMounted]);

  const isSendingRef = useRef(false);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (isSendingRef.current || !mediaRecorderRef.current) return null;
    isSendingRef.current = true;

    return new Promise((resolve) => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const recorder = mediaRecorderRef.current!;
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        recorder.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        isRecordingRef.current = false;
        isSendingRef.current = false;

        const finalDuration = limitReachedRef.current
          ? Math.min(MAX_VOICE_DURATION, Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000)))
          : 0;

        // Production guard: reject empty recordings and blobs over the voice cap.
        if (blob.size === 0) {
          setState({ isRecording: false, duration: finalDuration, error: 'Recording was empty. Please try again.', limitReached: limitReachedRef.current });
          resolve(null);
          return;
        }
        if (blob.size > MAX_VOICE_SIZE) {
          setState({ isRecording: false, duration: finalDuration, error: 'Voice message is too large. Please keep it under 5MB.', limitReached: limitReachedRef.current });
          resolve(null);
          return;
        }

        setState({ isRecording: false, duration: finalDuration, error: null, limitReached: limitReachedRef.current });
        resolve(blob);
      };

      try {
        recorder.stop();
      } catch {
        // Recorder may already be inactive after an auto-stop.
        isRecordingRef.current = false;
        isSendingRef.current = false;
        resolve(null);
      }
    });
  }, []);

  const cancelRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
    }
    chunksRef.current = [];
    isRecordingRef.current = false;
    isSendingRef.current = false;
    limitReachedRef.current = false;
    setState({ isRecording: false, duration: 0, error: null, limitReached: false });
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
