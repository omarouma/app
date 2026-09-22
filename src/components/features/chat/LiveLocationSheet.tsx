import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation, X, Clock } from 'lucide-react';
import { LIVE_LOCATION_DURATIONS } from '@/lib/chatConstants';

export interface LiveLocationSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen duration in minutes (0 = until turned off). */
  onStart: (minutes: number) => void;
  /** True while the initial GPS fix is being acquired. */
  starting?: boolean;
}

/**
 * Bottom sheet that lets the user pick how long to share their live location.
 *
 * Design-system rule (E1): ONE primary GaGa accent. The selected duration uses
 * the GaGa green tint + green glyph; everything else stays neutral.
 */
export function LiveLocationSheet({ open, onClose, onStart, starting = false }: LiveLocationSheetProps) {
  const [selected, setSelected] = useState<number>(15);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="bg-background rounded-t-3xl w-full max-w-lg flex flex-col"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 dark:bg-white/20 rounded-full mx-auto mt-3 mb-2" />

            <div className="flex items-center gap-3 px-5 pt-2 pb-3">
              <div className="w-11 h-11 rounded-full bg-[#00C300]/10 dark:bg-[#00C300]/15 flex items-center justify-center shrink-0">
                <Navigation size={22} className="text-[#00C300]" strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-foreground">Share Live Location</h3>
                <p className="text-xs text-muted-foreground">Your location updates in real time until it expires.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-2 -mr-1 text-muted-foreground hover:text-foreground rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pb-2 space-y-2">
              {LIVE_LOCATION_DURATIONS.map((opt) => {
                const active = selected === opt.minutes;
                return (
                  <button
                    key={opt.minutes}
                    type="button"
                    onClick={() => setSelected(opt.minutes)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors ${
                      active
                        ? 'bg-[#00C300]/10 dark:bg-[#00C300]/15'
                        : 'bg-muted hover:bg-muted/70'
                    }`}
                  >
                    <Clock size={18} className={active ? 'text-[#00C300]' : 'text-muted-foreground'} strokeWidth={1.8} />
                    <span className={`flex-1 text-sm font-medium ${active ? 'text-[#00C300]' : 'text-foreground'}`}>
                      {opt.label}
                    </span>
                    <span
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        active ? 'border-[#00C300]' : 'border-muted-foreground/40'
                      }`}
                    >
                      {active && <span className="w-2.5 h-2.5 rounded-full bg-[#00C300]" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-5 pt-3 pb-1">
              <button
                type="button"
                disabled={starting}
                onClick={() => onStart(selected)}
                className="w-full py-3.5 rounded-2xl bg-[#00C300] text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {starting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Getting your location…
                  </>
                ) : (
                  'Start Sharing'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LiveLocationSheet;
