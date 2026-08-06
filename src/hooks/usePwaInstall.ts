import { useEffect, useState, useCallback } from 'react';
import { useIsMounted } from './use-mobile';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function usePwaInstall() {
  const isMounted = useIsMounted();
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (!isMounted) return;

    const ua = window.navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(iOS);

    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setInstalled(true);
      return;
    }

    if (iOS) return;

    // Event may have already fired before this hook mounted
    if (deferredPrompt) setCanInstall(true);

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      if (isMounted) setCanInstall(true);
    };

    const installedHandler = () => {
      setInstalled(true);
      setCanInstall(false);
      deferredPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [isMounted]);

  const triggerInstall = useCallback(async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    deferredPrompt = null;
    setCanInstall(false);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
  }, [isIOS]);

  const dismissIOSGuide = useCallback(() => setShowIOSGuide(false), []);

  return { canInstall, installed, triggerInstall, isIOS, showIOSGuide, dismissIOSGuide };
}