import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield, UserPlus } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { toast } from 'sonner';

export default function BlockedUsersPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { blockedUsers, loadingBlocked, unblockUser, getBlockedUsers, subscribeBlockedUsers } = useFriendStore();
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    if (typeof subscribeBlockedUsers === 'function') {
      unsubRef.current = subscribeBlockedUsers(user.id);
    } else {
      getBlockedUsers(user.id);
    }
    return () => { unsubRef.current?.(); };
  }, [user?.id, getBlockedUsers, subscribeBlockedUsers]);

  const handleUnblock = async (blockedId: string) => {
    if (!user?.id) return;
    try {
      await unblockUser(blockedId, user.id);
      toast.success('User unblocked');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to unblock user');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-muted flex flex-col">
      {/* Header */}
      <div className="bg-background border-b border-border flex items-center gap-3 p-4 sticky top-0 z-10">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-muted rounded-full text-foreground">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Blocked Users</h1>
        <span className="ml-auto text-xs text-muted-foreground font-medium">{blockedUsers.length} blocked</span>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {loadingBlocked && <LoadingSkeleton count={4} variant="list" />}
        {!loadingBlocked && blockedUsers.length === 0 && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-64 flex items-center justify-center"
          >
            <EmptyState
              icon={Shield}
              title="No blocked users"
              description="Users you block will appear here"
            />
          </motion.div>
        )}
        {!loadingBlocked && blockedUsers.length > 0 && (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            {blockedUsers.map((record, i) => (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-background border border-border rounded-xl p-4 flex items-center gap-3"
              >
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {sanitizeMediaUrl(record.blockedUser?.avatar) ? (
                    <img src={sanitizeMediaUrl(record.blockedUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                  ) : (
                    <img src={getDefaultAvatar(record.blockedUser?.id || record.blockedUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm font-medium">{record.blockedUser?.name || 'User'}</p>
                  <p className="text-muted-foreground text-xs">@{record.blockedUser?.username || record.blockedId.slice(0, 8)}</p>
                  {record.reason && (
                    <p className="text-muted-foreground text-[11px] mt-0.5 truncate">Reason: {record.reason}</p>
                  )}
                </div>
                <button type="button" onClick={() => handleUnblock(record.blockedId)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[#00C300]/10 text-[#00C300] text-xs rounded-full font-medium active:bg-[#00C300]/20 transition-colors"
                >
                  <UserPlus size={12} /> Unblock
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}