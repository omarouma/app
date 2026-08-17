import { useState, useEffect, useMemo } from 'react';
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
import type { CallRecord } from '@/types';

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
  const { history, loading, subscribeToCallHistory, clearCallHistory, deleteCall } = useCallStore();
  const friends = useFriendStore((s) => s.friends);

  const [activeTab, setActiveTab] = useState<'all' | 'missed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useDocumentTitle('Calls');

  useEffect(() => {
    if (user?.id) {
      const unsubscribe = subscribeToCallHistory(user.id);
      return () => unsubscribe();
    }
  }, [user?.id, subscribeToCallHistory]);

  const friendMap = useMemo(() => new Map(friends.map(f => [f.id, f])), [friends]);

  const callsWithDetails = useMemo((): CallWithDetails[] => {
    return history
      .map((call) => {
        const otherId = getOtherParticipantId(call, user?.id);
        const direction = getCallDirection(call, user?.id);
        const friend = friendMap.get(otherId);
        return {
          ...call,
          otherId,
          name: friend?.name || 'Unknown User',
          avatar: friend?.avatar,
          direction,
        };
      })
      .sort((a, b) => {
        const at = a.timestamp instanceof Date ? a.timestamp.getTime() : Number(new Date(a.timestamp as unknown as string | number));
        const bt = b.timestamp instanceof Date ? b.timestamp.getTime() : Number(new Date(b.timestamp as unknown as string | number));
        return bt - at;
      });
  }, [history, user?.id, friendMap]);

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
    // firestore.ts is a router to the Supabase backend — this check reflects
    // real backend connectivity (Supabase), not Firestore specifically.
    if (!isFirestoreAvailable()) {
      toast.error('You appear to be offline. Cannot place calls at the moment.');
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
    <div className="h-[100dvh] flex flex-col bg-secondary/40 page-enter">
      <header className="page-header flex-col !items-stretch !gap-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Calls</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {history.length} total · {history.filter(c => c.status === 'missed').length} missed
            </p>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="icon-btn w-10 h-10 sm:w-11 sm:h-11 bg-accent"
                aria-label="Clear all call history"
              >
                <Trash2 size={18} className="text-muted-foreground" />
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/contacts', { state: { from: 'calls' } })}
              className="icon-btn w-10 h-10 sm:w-11 sm:h-11 bg-accent"
              aria-label="New call"
            >
              <Phone size={18} className="text-foreground" />
            </button>
          </div>
        </div>

        <div className="max-w-md mx-auto sm:mx-0 w-full">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name..."
              className="input-surface w-full pl-10 pr-4 py-2.5"
            />
          </div>
        </div>

        <div className="w-full">
          <div className="flex gap-2 mx-auto sm:mx-0 max-w-xs sm:max-w-none">
            {(['all', 'missed'] as const).map((tab) => (
              <button
                type="button"
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 sm:px-5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all tap-scale ${activeTab === tab
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-accent text-muted-foreground hover:text-foreground'
                  }`}
              >
                {tab === 'all' ? 'All' : 'Missed'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Call List */}
      <div className="page-content max-w-3xl mx-auto w-full">
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
              className="card-surface overflow-hidden divide-y divide-border"
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