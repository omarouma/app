import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, Smartphone } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { safeGetStorageItem, safeSetStorageItem } from '@/lib/safeStorage';

export default function PWAPrompt() {
  const { canInstall, installed, triggerInstall } = usePwaInstall();
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isDismissed = safeGetStorageItem('pwa-prompt-dismissed');
    if (isDismissed || installed) return;

    const timer = setTimeout(() => {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIos) {
        // iOS doesn't support beforeinstallprompt, show iOS guide
        setShowPrompt(true);
      } else if (canInstall) {
        setShowPrompt(true);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [canInstall, installed]);

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    safeSetStorageItem('pwa-prompt-dismissed', 'true');
  };

  const handleInstall = async () => {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIos) {
      setShowPrompt(false);
      setShowIosGuide(true);
      return;
    }
    await triggerInstall();
    handleDismiss();
  };

  if (installed || dismissed) return null;

  return (
    <>
      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[100]"
          >
            <div className="bg-white border-t border-[#EBEBEB] shadow-[0_-4px_20px_rgba(0,0,0,0.1)] p-4">
              <div className="max-w-lg mx-auto flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center shrink-0 shadow-lg">
                  <Smartphone size={22} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#111111] text-sm font-bold">Install GaGa Chat</p>
                  <p className="text-[#8D8D8D] text-xs">Get the best experience with faster access and offline support</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={handleDismiss}
                    className="text-[#8D8D8D] hover:text-[#111111] px-3 py-2 text-xs font-medium transition-colors"
                  >
                    Not now
                  </button>
                  <button type="button" onClick={handleInstall}
                    className="bg-[#00C300] hover:bg-[#00A300] text-white rounded-full px-5 py-2.5 text-xs font-bold shadow-lg shadow-[#00C300]/30 transition-all active:scale-95"
                  >
                    <span className="flex items-center gap-1.5">
                      <Download size={14} />
                      Install
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Install Guide Modal */}
      <AnimatePresence>
        {showIosGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowIosGuide(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="pwa-install-title"
              className="bg-white rounded-t-3xl p-6 w-full max-w-lg"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#00C300] flex items-center justify-center">
                    <Smartphone size={20} className="text-white" />
                  </div>
                  <h3 id="pwa-install-title" className="text-[#111111] font-bold text-lg">Install GaGa Chat</h3>
                </div>
                <button type="button" onClick={() => setShowIosGuide(false)} className="text-[#8D8D8D] p-1 hover:bg-gray-100 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                {[
                  { step: 1, text: <>Tap the <Share size={14} className="inline text-blue-500 mx-1" /> <strong>Share</strong> button in Safari</> },
                  { step: 2, text: <>Scroll down and tap <strong>"Add to Home Screen"</strong></> },
                  { step: 3, text: <>Tap <strong>"Add"</strong> to install GaGa Chat</> },
                ].map(({ step, text }) => (
                  <div key={step} className="flex items-center gap-4 p-3 bg-[#F5F5F5] rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-[#00C300] flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {step}
                    </div>
                    <p className="text-[#111111] text-sm">{text}</p>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setShowIosGuide(false)}
                className="w-full mt-6 bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl py-3.5 font-bold text-sm transition-colors"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
