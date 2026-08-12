import { useEffect, useState, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(() => !!deferredPrompt);
  const [installed, setInstalled] = useState(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        !!(window.navigator as any).standalone),
  );
  const [isIOS] = useState(
    () =>
      typeof window !== 'undefined' &&
      /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
      !(window as any).MSStream,
  );
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (installed || isIOS) return;

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      setCanInstall(true);
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
  }, [installed, isIOS]);

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