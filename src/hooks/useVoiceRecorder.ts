import { useState, useRef, useCallback, useEffect } from 'react';

interface VoiceRecorderState {
  isRecording: boolean;
  duration: number;
  error: string | null;
}

export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>({
    isRecording: false,
    duration: 0,
    error: null,
  });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (mediaRecorderRef.current) {
        try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    // Check permission before requesting the device
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (result.state === 'denied') {
          setState({ isRecording: false, duration: 0, error: 'Microphone access denied. Enable it in browser settings.' });
          return;
        }
      } catch { /* permissions API not supported — proceed */ }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100);

      timerRef.current = setInterval(() => {
        setState((s) => ({ ...s, duration: Math.floor((Date.now() - startTimeRef.current) / 1000) }));
      }, 1000);

      setState({ isRecording: true, duration: 0, error: null });
    } catch {
      setState({ isRecording: false, duration: 0, error: 'Microphone access denied' });
    }
  }, []);

  const isSendingRef = useRef(false);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    // D3: guard against double-call (e.g. rapid tap on send button)
    if (isSendingRef.current) return null;
    isSendingRef.current = true;
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        isSendingRef.current = false;
        resolve(null);
        return;
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        isSendingRef.current = false;
        setState({ isRecording: false, duration: 0, error: null });
        resolve(blob);
      };

      mediaRecorderRef.current.stop();
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
    isSendingRef.current = false;
    setState({ isRecording: false, duration: 0, error: null });
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
