import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, X, Loader, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useFriendStore } from '@/store/useFriendStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { User } from '@/types';

export interface ReportUserSheetProps {
  /** The user being reported. `null` closes the sheet. */
  user: User | null;
  onClose: () => void;
}

const REASONS: { id: string; label: string }[] = [
  { id: 'spam', label: 'Spam or scam' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate', label: 'Hate speech' },
  { id: 'violence', label: 'Violence or dangerous content' },
  { id: 'nudity', label: 'Nudity or sexual content' },
  { id: 'impersonation', label: 'Impersonation' },
  { id: 'false_info', label: 'False information' },
  { id: 'other', label: 'Something else' },
];

/**
 * Bottom-sheet used to report a user. Collects a reason (required) plus optional
 * free-text details and submits the report through the friend store.
 */
export default function ReportUserSheet({ user, onClose }: ReportUserSheetProps) {
  const { user: currentUser } = useAuthStore();
  const { reportUser } = useFriendStore();
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever a new user is opened.
  useEffect(() => {
    setReason('');
    setDetails('');
    setSubmitting(false);
  }, [user?.id]);

  const handleSubmit = async () => {
    if (!user || !currentUser?.id) return;
    if (!reason) {
      toast.error('Please choose a reason');
      return;
    }
    setSubmitting(true);
    try {
      await reportUser({
        reporterId: currentUser.id,
        reportedId: user.id,
        reason,
        details: details.trim(),
      });
      toast.success('Report submitted. Thank you for helping keep GaGa safe.');
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {user && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed top-0 right-0 bottom-0 left-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="bg-background rounded-t-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto pb-[max(16px,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-muted rounded-full mx-auto mt-3 mb-4" />

            <div className="px-5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-[#FF3B30]/10 flex items-center justify-center">
                    <Flag size={18} className="text-[#FF3B30]" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">Report {user.name || 'user'}</h3>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"
                  aria-label="Close report sheet"
                >
                  <X size={18} className="text-muted-foreground" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Your report is anonymous. The user will not be told that you reported them.
              </p>

              <div className="space-y-1.5">
                {REASONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReason(r.id)}
                    className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors text-left ${
                      reason === r.id
                        ? 'border-[#FF3B30] bg-[#FF3B30]/5'
                        : 'border-border hover:bg-muted'
                    }`}
                    aria-pressed={reason === r.id}
                  >
                    <span className="text-sm font-medium text-foreground">{r.label}</span>
                    {reason === r.id && <Check size={16} className="text-[#FF3B30] shrink-0" />}
                  </button>
                ))}
              </div>

              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Add any additional details (optional)"
                rows={3}
                maxLength={500}
                className="w-full mt-3 bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-[#FF3B30]"
                aria-label="Report details"
              />

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !reason}
                className="w-full mt-4 py-3 bg-[#FF3B30] text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <><Loader size={16} className="animate-spin" /> Submitting…</> : 'Submit report'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full mt-2 py-3 bg-muted text-foreground rounded-xl text-sm font-bold"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
