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
  /** Object URL of the just-recorded clip awaiting send/discard (preview). */
  previewUrl: string | null;
  /** Duration (seconds) of the clip currently in preview. */
  previewDuration: number;
}

export function useVoiceRecorder() {
  const isMounted = useIsMounted();
  const [state, setState] = useState<VoiceRecorderState>({
    isRecording: false,
    duration: 0,
    error: null,
    limitReached: false,
    previewUrl: null,
    previewDuration: 0,
  });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const isRecordingRef = useRef(false);
  const limitReachedRef = useRef(false);
  const previewBlobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch { /* noop */ }
    }
    previewUrlRef.current = null;
    previewBlobRef.current = null;
  }, []);

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
      revokePreview();
    };
  }, [revokePreview]);

  const startRecording = useCallback(async () => {
    if (!isMounted) return;
    // Guard against double-start (e.g. rapid taps on the mic button).
    if (isRecordingRef.current) return;
    // Starting a new recording discards any clip still in preview.
    revokePreview();

    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (result.state === 'denied') {
        setState({ isRecording: false, duration: 0, error: 'Microphone access denied. Enable it in browser settings.', limitReached: false, previewUrl: null, previewDuration: 0 });
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
          setState((s) => ({ ...s, isRecording: false, duration: elapsed, error: null, limitReached: true }));
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
          }
          return;
        }
        setState((s) => ({ ...s, duration: elapsed, isRecording: true, limitReached: false }));
      }, 1000);

      setState((s) => ({ ...s, isRecording: true, duration: 0, error: null, limitReached: false, previewUrl: null, previewDuration: 0 }));
    } catch {
      setState((s) => ({ ...s, isRecording: false, duration: 0, error: 'Microphone access denied', limitReached: false }));
    }
  }, [isMounted, revokePreview]);

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

        const finalDuration = Math.min(
          MAX_VOICE_DURATION,
          Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000)),
        );

        // Production guard: reject empty recordings and blobs over the voice cap.
        if (blob.size === 0) {
          setState((s) => ({ ...s, isRecording: false, duration: finalDuration, error: 'Recording was empty. Please try again.', limitReached: limitReachedRef.current }));
          resolve(null);
          return;
        }
        if (blob.size > MAX_VOICE_SIZE) {
          setState((s) => ({ ...s, isRecording: false, duration: finalDuration, error: 'Voice message is too large. Please keep it under 5MB.', limitReached: limitReachedRef.current }));
          resolve(null);
          return;
        }

        // Enter preview state: keep the blob + an object URL so the composer can
        // show a playable preview bar before the user commits to sending.
        previewBlobRef.current = blob;
        let url: string | null = null;
        try { url = URL.createObjectURL(blob); } catch { url = null; }
        previewUrlRef.current = url;

        setState((s) => ({
          ...s,
          isRecording: false,
          duration: finalDuration,
          error: null,
          limitReached: limitReachedRef.current,
          previewUrl: url,
          previewDuration: finalDuration,
        }));
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
    setState((s) => ({ ...s, isRecording: false, duration: 0, error: null, limitReached: false }));
  }, []);

  /** Clears the preview clip (revokes its object URL). */
  const clearPreview = useCallback(() => {
    revokePreview();
    setState((s) => ({ ...s, previewUrl: null, previewDuration: 0 }));
  }, [revokePreview]);

  /** Discards the preview clip without sending it. */
  const discardPreview = useCallback(() => {
    clearPreview();
  }, [clearPreview]);

  /** Returns the blob currently held in preview (or null). */
  const getPreviewBlob = useCallback((): Blob | null => previewBlobRef.current, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
    clearPreview,
    discardPreview,
    getPreviewBlob,
  };
}
