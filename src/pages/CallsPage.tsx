import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Search, PhoneMissed, Trash2 } from 'lucide-react';

import { useAuthStore } from '@/store/useAuthStore';
import { useCallStore } from '@/store/useCallStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import EmptyState from '@/components/EmptyState';
import { toast } from 'sonner';

import { isFirestoreAvailable } from '@/lib/firestore';
import type { CallRecord, User } from '@/types';

type CallDirection = 'outgoing' | 'incoming';
import { CallListItem } from '@/components/features/calls/CallListItem';
import { getCallDirection, getOtherParticipantId } from '@/lib/callUtils';

type CallWithDetails = CallRecord & {
  otherId: string;
  name: string;
  avatar?: string;
  direction: CallDirection;
};


export default function CallsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { history, loading, subscribeCalls, clearCallHistory, deleteCall } = useCallStore();

  const subscribeCallsRef = useRef(subscribeCalls);
  useEffect(() => { subscribeCallsRef.current = subscribeCalls; });
  const friends = useFriendStore((s) => s.friends);
  const getUserById = useFriendStore((s) => s.getUserById);

  const [activeTab, setActiveTab] = useState<'all' | 'missed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [resolvedProfiles, setResolvedProfiles] = useState<Record<string, User>>({});

  useDocumentTitle('Calls');

  useEffect(() => {
    if (user?.id) {
      const unsubscribe = subscribeCallsRef.current(user.id);
      return () => unsubscribe();
    }
  }, [user?.id]);

  const friendMap = useMemo(() => new Map(friends.map(f => [f.id, f])), [friends]);

  const callsWithDetails = useMemo((): CallWithDetails[] => {
    return history
      .map((call) => {
        const otherId = getOtherParticipantId(call, user?.id);
        const direction = getCallDirection(call, user?.id);
        const friend = friendMap.get(otherId);
        const resolved = resolvedProfiles[otherId];
        const profile = friend || resolved;
        return {
          ...call,
          otherId,
          name: profile?.name || 'Unknown User',
          avatar: profile?.avatar,
          direction,
        };
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [history, user?.id, friendMap, resolvedProfiles]);

  // Resolve profiles for callers not in the friends list
  useEffect(() => {
    let cancelled = false;
    const unknownIds = [...new Set(
      callsWithDetails
        .filter((c) => !friendMap.has(c.otherId) && !resolvedProfiles[c.otherId])
        .map((c) => c.otherId)
    )];

    if (unknownIds.length === 0) return;

    Promise.all(unknownIds.map((id) => getUserById(id))).then((profiles) => {
      if (cancelled) return;
      setResolvedProfiles((prev) => {
        const next = { ...prev };
        unknownIds.forEach((id, i) => {
          if (profiles[i]) next[id] = profiles[i] as User;
        });
        return next;
      });
    });

    return () => { cancelled = true; };
  }, [callsWithDetails, friendMap, resolvedProfiles, getUserById]);

  const filteredCalls = useMemo(() => {
    let calls = callsWithDetails;
    if (activeTab === 'missed') {
      calls = calls.filter(c => c.status === 'missed' && c.direction === 'incoming');
    }
    if (searchQuery) {
      const lowercasedQuery = searchQuery.toLowerCase();
      calls = calls.filter(c => c.name.toLowerCase().includes(lowercasedQuery));
    }
    return calls;
  }, [callsWithDetails, activeTab, searchQuery]);

  const handleInitiateCall = (type: 'voice' | 'video', userId: string) => {
    if (!isFirestoreAvailable()) {
      toast.error('Connection error. Cannot place calls at the moment.');
      return;
    }
navigate('/call', { state: { userId, mode: type, isOutgoing: true } });
  };

  const handleDelete = async (callId: string) => {
    const promise = async () => {
      if (!user?.id) throw new Error('Authentication error');
      await deleteCall(callId);
    };
    toast.promise(promise, {
      loading: 'Deleting call...',
      success: 'Call deleted from history.',
      error: 'Failed to delete call.',
    });
  };

  const handleClearAll = async () => {
    const promise = async () => {
      if (!user?.id) throw new Error('Authentication error');
      await clearCallHistory(user.id);
    };
    toast.promise(promise, {
      loading: 'Clearing call history...',
      success: 'Call history cleared.',
      error: 'Failed to clear history.',
    });
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-white text-gray-900 page-enter">
      {/* Header */}
      <div className="shrink-0 px-4 pt-5 pb-3 flex justify-between items-center bg-white">
        <h1 className="text-2xl font-bold tracking-tight">Calls</h1>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="w-9 h-9 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition-colors tap-scale"
              aria-label="Clear all call history"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/contacts', { state: { from: 'calls' } })}
            className="w-9 h-9 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition-colors tap-scale"
            aria-label="New call"
          >
            <Phone size={18} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-4 pb-2">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name..."
            className="w-full bg-gray-100 rounded-full pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]/40 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-2 px-4 pb-2">
        {(['all', 'missed'] as const).map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors tap-scale ${
              activeTab === tab
                ? 'bg-[#00C300] text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab === 'all' ? 'All' : 'Missed'}
          </button>
        ))}
      </div>

      {/* Call List */}
      <div className="flex-1 overflow-y-auto pb-nav">
        {loading && <LoadingSkeleton count={5} variant="list" />}
        
        {!loading && filteredCalls.length === 0 && (
          <EmptyState
            icon={searchQuery ? Search : PhoneMissed}
            title={searchQuery ? 'No results found' : 'No call history'}
            description={
              searchQuery
                ? `No calls match "${searchQuery}"`
                : activeTab === 'missed'
                ? 'You have no missed calls.'
                : 'Your call log is empty. Start a call from a contact.'
            }
          />
        )}

        {!loading && filteredCalls.length > 0 && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="divide-y divide-gray-100"
            >
              {filteredCalls.map((call) => (
                <CallListItem
                  key={call.id}
                  call={call}
                  userName={call.name}
                  userAvatar={call.avatar}
                  currentUserId={user?.id}
                  onCall={handleInitiateCall}
                  onDelete={handleDelete}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}