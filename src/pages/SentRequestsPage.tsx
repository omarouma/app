import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, UserPlus, X } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { getDefaultAvatar, sanitizeMediaUrl, formatTime } from '@/lib/utils';
import { toast } from 'sonner';

export default function SentRequestsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { sentRequests, loadingSentRequests, cancelRequest, getSentRequests, subscribeSentRequests } = useFriendStore();
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    // Real-time subscription; fall back to one-shot fetch if store doesn't expose subscribe
    if (typeof subscribeSentRequests === 'function') {
      unsubRef.current = subscribeSentRequests(user.id);
    } else {
      getSentRequests(user.id);
    }
    return () => { unsubRef.current?.(); };
  }, [user?.id, getSentRequests, subscribeSentRequests]);

  const handleCancel = async (requestId: string) => {
    try {
      await cancelRequest(requestId);
      toast.success('Request cancelled');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel request');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-[#EBEBEB] flex items-center gap-3 p-4 sticky top-0 z-10">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-gray-100 rounded-full text-[#111111]">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-[#111111]">Sent Requests</h1>
        <span className="ml-auto text-xs text-[#8D8D8D] font-medium">{sentRequests.length} pending</span>
      </div>

      <div className="flex-1 p-4 space-y-3">
        <AnimatePresence mode="wait">
          {loadingSentRequests ? (
            <LoadingSkeleton count={4} variant="list" />
          ) : sentRequests.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-64 flex items-center justify-center"
            >
              <EmptyState
                icon={UserPlus}
                title="No sent requests"
                description="Friend requests you send will appear here"
                action={
                  <button type="button" onClick={() => navigate('/add-friends')}
                    className="text-[#00C300] text-sm font-medium hover:underline"
                  >
                    Find Friends
                  </button>
                }
              />
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {sentRequests.map((req, i) => (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white border border-[#EBEBEB] rounded-xl p-4 flex items-center gap-3"
                >
                  <div className="w-12 h-12 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden shrink-0">
                    {sanitizeMediaUrl(req.toUser?.avatar) ? (
                      <img src={sanitizeMediaUrl(req.toUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                    ) : (
                      <img src={getDefaultAvatar(req.toUser?.id || req.toUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#111111] text-sm font-medium">{req.toUser?.name || 'User'}</p>
                    <p className="text-[#8D8D8D] text-xs">@{req.toUser?.username || req.toUserId.slice(0, 8)}</p>
                    {req.toUser?.bio && <p className="text-[#8D8D8D] text-[11px] mt-0.5 truncate">{req.toUser.bio}</p>}
                    <p className="text-[#8D8D8D] text-[10px] mt-0.5">Sent {formatTime(req.timestamp)}</p>
                  </div>
                  <button type="button" onClick={() => handleCancel(req.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#F5F5F5] text-[#FF3B30] text-xs rounded-full font-medium active:bg-gray-100 transition-colors"
                  >
                    <X size={12} /> Cancel
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
