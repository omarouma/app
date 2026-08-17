/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

interface VoicePlayerState {
  activeAudioKey: string | null;
  register: (key: string, audio: HTMLAudioElement) => void;
  unregister: (key: string) => void;
  notifyPlaying: (key: string) => void;
  pauseAllExcept: (key: string) => void;
}

const VoicePlayerContext = createContext<VoicePlayerState | null>(null);

export function VoicePlayerProvider({ children }: { children: ReactNode }) {
  const activeKeyRef = useRef<string | null>(null);
  const registryRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const register = useCallback((key: string, audio: HTMLAudioElement) => {
    registryRef.current.set(key, audio);
  }, []);

  const unregister = useCallback((key: string) => {
    const audio = registryRef.current.get(key);
    if (audio) {
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
    }
    registryRef.current.delete(key);
    if (activeKeyRef.current === key) activeKeyRef.current = null;
  }, []);

  const pauseAllExcept = useCallback((key: string) => {
    for (const [k, audio] of registryRef.current.entries()) {
      if (k === key) continue;
      try {
        if (!audio.paused) audio.pause();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const notifyPlaying = useCallback(
    (key: string) => {
      if (activeKeyRef.current !== key) {
        pauseAllExcept(key);
        activeKeyRef.current = key;
      }
    },
    [pauseAllExcept],
  );

  const value = useMemo<VoicePlayerState>(
    () => ({
      get activeAudioKey() {
        return activeKeyRef.current;
      },
      register,
      unregister,
      notifyPlaying,
      pauseAllExcept,
    }),
    [register, unregister, notifyPlaying, pauseAllExcept],
  );

  return (
    <VoicePlayerContext.Provider value={value}>
      {children}
    </VoicePlayerContext.Provider>
  );
}

export function useVoicePlayer(): VoicePlayerState {
  const ctx = useContext(VoicePlayerContext);
  if (!ctx) {
    return {
      activeAudioKey: null,
      register: () => {},
      unregister: () => {},
      notifyPlaying: () => {},
      pauseAllExcept: () => {},
    };
  }
  return ctx;
}
