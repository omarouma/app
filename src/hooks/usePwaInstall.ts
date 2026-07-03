import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Detect iOS Safari
    const ua = window.navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as Record<string, unknown>).MSStream;
    queueMicrotask(() => setIsIOS(iOS));

    // Already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as unknown as Record<string, unknown>).standalone === true) {
      queueMicrotask(() => setInstalled(true));
      return;
    }

    // iOS: show install guide instead of native prompt
    if (iOS) {
      // iOS doesn't support beforeinstallprompt, so we show a manual guide
      return;
    }

    // Use cached prompt if available (e.g. re-render)
    if (deferredPrompt) {
      queueMicrotask(() => setCanInstall(true));
    }

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
  }, []);

  const triggerInstall = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
      setCanInstall(false);
    }
    deferredPrompt = null;
  };

  const dismissIOSGuide = () => setShowIOSGuide(false);

  return { canInstall, installed, triggerInstall, isIOS, showIOSGuide, dismissIOSGuide };
}
