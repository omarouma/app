/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Video, ArrowLeft, Search, PhoneMissed, Trash2, Filter } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useCallStore } from '@/store/useCallStore';
import { useFriendStore } from '@/store/useFriendStore';
import { usePageTitle } from '@/hooks/useDocumentTitle';
import BottomNav from '@/components/layout/BottomNav';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import EmptyState from '@/components/EmptyState';
import { toast } from 'sonner';
import { isFirestoreAvailable } from '@/lib/firestore';

export default function CallsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { history, subscribeCalls } = useCallStore();
  const { friends } = useFriendStore();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'missed' | 'outgoing' | 'incoming'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  usePageTitle('Calls');

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    const unsub = subscribeCalls(user.id);
    // Loading is cleared by the store subscription callback, not a timer
    const fallback = setTimeout(() => setLoading(false), 3000);
    return () => { clearTimeout(fallback); unsub(); };
  }, [user?.id, subscribeCalls]);

  // Clear loading once the store delivers the first data snapshot
  useEffect(() => {
    setLoading(false);
  }, [history]);

  const getCallDirection = (call: any) => {
    if (!user) return 'incoming';
    return call.initiatorId === user.id ? 'outgoing' : 'incoming';
  };

  const getOtherUserId = (call: any) => {
    return call.participantIds?.find((id: string) => id !== user?.id) || call.initiatorId || '';
  };

  const getUserName = (otherId: string) => {
    const f = friends.find((fr) => fr.id === otherId);
    return f?.name || 'Unknown';
  };

  const filteredCalls = (history || []).filter((call) => {
    const direction = getCallDirection(call);
    if (activeTab === 'missed') return call.status === 'missed';
    if (activeTab === 'outgoing') return direction === 'outgoing';
    if (activeTab === 'incoming') return direction === 'incoming';
    return true;
  }).filter((call) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const otherId = getOtherUserId(call);
    const name = getUserName(otherId).toLowerCase();
    return name.includes(q) || otherId.toLowerCase().includes(q);
  });

  const handleCall = (type: 'voice' | 'video', userId: string) => {
    if (!isFirestoreAvailable()) {
      toast.error('Firestore is not available. Call functionality requires a backend connection.');
      return;
    }
    navigate('/call', { state: { userId, mode: type } });
  };

  const handleDelete = async (callId: string) => {
    if (!isFirestoreAvailable()) return;
    try {
      const { deleteDocById, COLLECTIONS } = await import('@/lib/firestore');
      await deleteDocById(COLLECTIONS.CALL_HISTORY, callId);
      toast.success('Call deleted');
    } catch {
      toast.error('Failed to delete call');
    }
  };

  const getCallIcon = (call: any) => {
    const direction = getCallDirection(call);
    if (call.status === 'missed') return <PhoneMissed size={18} className="text-[#FF3B30]" />;
    if (direction === 'outgoing') return <Phone size={18} className="text-[#00C300]" />;
    return <Phone size={18} className="text-[#00C300]" />;
  };

  const getCallLabel = (call: any) => {
    const direction = getCallDirection(call);
    if (call.status === 'missed') return 'Missed';
    if (direction === 'outgoing') return 'Outgoing';
    return 'Incoming';
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-[#0d0d0d]">
      <div className="shrink-0 px-4 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-[#F5F5F5] flex items-center justify-center">
              <ArrowLeft size={20} className="text-[#111111]" />
            </button>
            <h1 className="text-lg font-bold text-white">Calls</h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setFilterOpen(!filterOpen)} className="p-2 rounded-xl hover:bg-[#1a1a1a] text-[#8D8D8D]">
              <Filter size={18} />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search calls..."
            className="w-full bg-[#1a1a1a] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-[#8D8D8D] outline-none focus:ring-2 focus:ring-[#00C300]"
          />
        </div>
        <AnimatePresence>
          {filterOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="flex gap-2 mt-3">
                {(['all', 'missed', 'outgoing', 'incoming'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeTab === tab ? 'bg-[#00C300] text-black' : 'bg-[#1a1a1a] text-[#8D8D8D]'}`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <LoadingSkeleton count={4} variant="list" />
        ) : filteredCalls.length === 0 ? (
          <EmptyState icon={Phone} title="No calls" description={searchQuery ? 'No calls match your search' : 'Your call history will appear here'} />
        ) : (
          <div className="divide-y divide-[#1a1a1a]">
            {filteredCalls.map((call) => (
              <div key={call.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a1a] transition-colors">
                <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center">
                  {getCallIcon(call)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{getUserName(getOtherUserId(call))}</p>
                  <div className="flex items-center gap-1 text-xs text-[#8D8D8D]">
                    {getCallLabel(call)}
                    <span>·</span>
                    <span>{call.duration ? `${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, '0')}` : '0:00'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => handleCall('voice', getOtherUserId(call))} className="p-2 rounded-full hover:bg-[#1a1a1a] text-[#00C300]">
                    <Phone size={18} />
                  </button>
                  <button type="button" onClick={() => handleCall('video', getOtherUserId(call))} className="p-2 rounded-full hover:bg-[#1a1a1a] text-[#00C300]">
                    <Video size={18} />
                  </button>
                  <button type="button" onClick={() => handleDelete(call.id)} className="p-2 rounded-full hover:bg-[#1a1a1a] text-[#FF3B30]">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
