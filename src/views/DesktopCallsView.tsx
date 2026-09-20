import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Phone, Video, PhoneOutgoing, PhoneIncoming, PhoneMissed, Search, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useCallStore } from '@/store/useCallStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useNavigate } from 'react-router-dom';
import EmptyState from '@/components/EmptyState';
import { formatTime, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { toast } from 'sonner';
import type { CallRecord } from '@/types';

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

  const handleDelete = (callId: string) => {
    toast.promise(deleteCall(callId), {
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

  const getCallIcon = (call: CallRecord) => {
    if (call.status === 'missed') return <PhoneMissed size={16} className="text-destructive" />;
    if (call.initiatorId === user?.id) return <PhoneOutgoing size={16} className="text-primary" />;
    return <PhoneIncoming size={16} className="text-primary" />;
  };

  const formatDuration = (s: number) => {
    if (!s) return '';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const filtered = history
    .filter(c => {
      const otherId = c.participantIds.find(id => id !== user?.id);
      const friend = friends.find(f => f.id === otherId);
      if (search && !friend?.name?.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === 'missed' && c.status !== 'missed') return false;
      return true;
    })
    .slice(0, 50);

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="shrink-0 p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Phone size={20} className="text-primary" /> Calls
          </h1>
          <div className="flex gap-2">
            {history.length > 0 && (
              <button type="button" onClick={handleClearAll}
                className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"
                title="Clear all"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button type="button" onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium ${filter === 'all' ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground'}`}
            >
              All
            </button>
            <button type="button" onClick={() => setFilter('missed')}
              className={`px-3 py-1 rounded-full text-xs font-medium ${filter === 'missed' ? 'bg-destructive text-white' : 'bg-secondary text-muted-foreground'}`}
            >
              Missed
            </button>
          </div>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search call history..."
            className="w-full bg-secondary border-none rounded-xl pl-10 pr-4 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {!ready ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse p-3">
                <div className="w-10 h-10 rounded-full bg-secondary" />
                <div className="flex-1">
                  <div className="h-3 bg-secondary rounded w-1/3 mb-1" />
                  <div className="h-2 bg-secondary rounded w-1/2" />
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
          filtered.map((call, i) => {
            const otherId = call.participantIds.find(id => id !== user?.id);
            const friend = friends.find(f => f.id === otherId);
            return (
              <motion.div
                key={call.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 p-4 hover:bg-secondary transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                  {sanitizeMediaUrl(friend?.avatar) ? (
                    <img src={sanitizeMediaUrl(friend?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                  ) : (
                    <img src={getDefaultAvatar(friend?.id || friend?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {getCallIcon(call)}
                    <p className={`text-sm font-medium truncate ${call.status === 'missed' ? 'text-destructive' : 'text-foreground'}`}>
                      {friend?.name || 'Unknown'}
                    </p>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {call.type === 'video' ? 'Video' : 'Voice'} call &bull; {formatTime(call.timestamp)}
                    {call.duration ? ` \u2022 ${formatDuration(call.duration)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => navigate('/call', { state: { userId: otherId, mode: 'voice' } })}
                    className="p-2 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                    title="Voice call"
                  >
                    <Phone size={16} />
                  </button>
                  <button type="button" onClick={() => navigate('/call', { state: { userId: otherId, mode: 'video' } })}
                    className="p-2 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                    title="Video call"
                  >
                    <Video size={16} />
                  </button>
                  <button type="button" onClick={() => handleDelete(call.id)}
                    className="p-2 rounded-full hover:bg-red-50 text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
