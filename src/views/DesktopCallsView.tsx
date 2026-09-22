import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Phone, Search, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useCallStore } from '@/store/useCallStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useNavigate } from 'react-router-dom';
import EmptyState from '@/components/EmptyState';
import { CallListItem } from '@/components/features/calls/CallListItem';
import { getCallDirection, getOtherParticipantId, groupCallsByDate } from '@/lib/callUtils';
import { toast } from 'sonner';
import type { CallRecord } from '@/types';

type CallWithDetails = CallRecord & {
  otherId: string;
  name: string;
  avatar?: string;
  direction: 'outgoing' | 'incoming';
};

export default function DesktopCallsView() {
  const { user } = useAuthStore();
  const { history, subscribeToCallHistory, deleteCall, clearCallHistory } = useCallStore();
  const { friends } = useFriendStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToCallHistory(user.id);
    const timeout = setTimeout(() => setReady(true), 150);
    return () => { clearTimeout(timeout); unsub(); };
  }, [user?.id, subscribeToCallHistory]);

  const friendMap = useMemo(() => new Map(friends.map((f) => [f.id, f])), [friends]);

  const callsWithDetails = useMemo((): CallWithDetails[] => {
    return history
      .map((call) => {
        const otherId = getOtherParticipantId(call, user?.id);
        const friend = friendMap.get(otherId);
        return {
          ...call,
          otherId,
          name: friend?.name || 'Unknown User',
          avatar: friend?.avatar,
          direction: getCallDirection(call, user?.id),
        };
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [history, user?.id, friendMap]);

  const filtered = useMemo(() => {
    let calls = callsWithDetails;
    if (filter === 'missed') {
      calls = calls.filter((c) => c.status === 'missed' && c.direction === 'incoming');
    }
    if (search) {
      const q = search.toLowerCase();
      calls = calls.filter((c) => c.name.toLowerCase().includes(q));
    }
    return calls.slice(0, 50);
  }, [callsWithDetails, filter, search]);

  const handleDelete = (callId: string) => {
    if (!user?.id) return;
    toast.promise(deleteCall(callId, user.id), {
      loading: 'Deleting…',
      success: 'Call deleted',
      error: 'Failed to delete',
    });
  };

  const handleClearAll = () => {
    if (!user?.id) return;
    toast.promise(clearCallHistory(user.id), {
      loading: 'Clearing…',
      success: 'History cleared',
      error: 'Failed to clear',
    });
  };

  const handleInitiateCall = (type: 'voice' | 'video', userId: string) => {
    navigate('/call', { state: { userId, mode: type, isOutgoing: true } });
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="shrink-0 p-4 border-b border-[#EBEBEB]">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-[#111111] flex items-center gap-2">
            <Phone size={20} className="text-[#00C300]" /> Calls
          </h1>
          <div className="flex gap-2">
            {history.length > 0 && (
              <button type="button" onClick={handleClearAll}
                className="p-2 rounded-full hover:bg-[#F5F5F5] text-[#8D8D8D] hover:text-[#FF3B30] transition-colors"
                title="Clear all"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button type="button" onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium ${filter === 'all' ? 'bg-[#00C300] text-white' : 'bg-[#F5F5F5] text-[#8D8D8D]'}`}
            >
              All
            </button>
            <button type="button" onClick={() => setFilter('missed')}
              className={`px-3 py-1 rounded-full text-xs font-medium ${filter === 'missed' ? 'bg-[#FF3B30] text-white' : 'bg-[#F5F5F5] text-[#8D8D8D]'}`}
            >
              Missed
            </button>
          </div>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search call history..."
            className="w-full bg-[#F5F5F5] border-none rounded-xl pl-10 pr-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {!ready ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse p-3">
                <div className="w-10 h-10 rounded-full bg-[#F5F5F5]" />
                <div className="flex-1">
                  <div className="h-3 bg-[#F5F5F5] rounded w-1/3 mb-1" />
                  <div className="h-2 bg-[#F5F5F5] rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Phone}
            title={filter === 'missed' ? 'No missed calls' : 'No call history'}
            description="Calls you make or receive will appear here"
          />
        ) : (
          <div className="pb-4">
            {groupCallsByDate(filtered).map((group) => (
              <div key={group.key}>
                <h2 className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#8D8D8D]">
                  {group.label}
                </h2>
                {group.items.map((call, i) => (
                  <motion.div
                    key={call.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <CallListItem
                      call={call}
                      userName={call.name}
                      userAvatar={call.avatar}
                      currentUserId={user?.id}
                      onCall={handleInitiateCall}
                      onDelete={handleDelete}
                    />
                  </motion.div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
