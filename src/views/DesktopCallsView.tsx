import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Phone, Video, PhoneOutgoing, PhoneIncoming, PhoneMissed, Search, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useCallStore } from '@/store/useCallStore';
import { toast } from 'sonner';
import { useFriendStore } from '@/store/useFriendStore';
import { useNavigate } from 'react-router-dom';
import EmptyState from '@/components/EmptyState';
import { formatTime, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import type { CallRecord, User } from '@/types';

export default function DesktopCallsView() {
  const { user } = useAuthStore();
const { history, subscribeCalls, deleteCall } = useCallStore();
  const { friends, getUserById } = useFriendStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const [ready, setReady] = useState(false);
  const [resolvedProfiles, setResolvedProfiles] = useState<Record<string, User>>({});

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeCalls(user.id);
    const timeout = setTimeout(() => setReady(true), 150);
    return () => { clearTimeout(timeout); unsub(); };
  }, [user?.id, subscribeCalls]);

  // Build a lookup for other participants across call history so non-friend
  // callers still show their real name/avatar instead of "Unknown".
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const otherIds = [
      ...new Set(
        history
          .map((c) => c.participantIds.find((id) => id !== user.id))
          .filter((id): id is string => !!id)
      ),
    ];
    const unknownIds = otherIds.filter(
      (id) => !friends.some((f) => f.id === id) && !resolvedProfiles[id]
    );
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
  }, [history, friends, user?.id, resolvedProfiles, getUserById]);

  const getCallIcon = (call: CallRecord) => {
    if (call.status === 'missed') return <PhoneMissed size={16} className="text-[#FF3B30]" />;
    if (call.initiatorId === user?.id) return <PhoneOutgoing size={16} className="text-[#00C300]" />;
    return <PhoneIncoming size={16} className="text-[#00C300]" />;
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
      const resolved = otherId ? resolvedProfiles[otherId] : undefined;
      const name = friend?.name || resolved?.name;
      if (search && !name?.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === 'missed' && c.status !== 'missed') return false;
      return true;
    })
    .slice(0, 50);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="shrink-0 p-4 border-b border-[#EBEBEB]">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-[#111111] flex items-center gap-2">
            <Phone size={20} className="text-[#00C300]" /> Calls
          </h1>
          <div className="flex gap-2">
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
          filtered.map((call, i) => {
            const otherId = call.participantIds.find(id => id !== user?.id);
            const friend = friends.find(f => f.id === otherId);
            const resolved = otherId ? resolvedProfiles[otherId] : undefined;
            const profile = friend || resolved;
            const name = profile?.name || 'Unknown';
            const avatar = profile?.avatar;
            return (
              <motion.div
                key={call.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 p-4 hover:bg-[#F5F5F5] transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden shrink-0">
                  {sanitizeMediaUrl(avatar) ? (
                    <img src={sanitizeMediaUrl(avatar)} className="w-full h-full object-cover" alt="User avatar" />
                  ) : (
                    <img src={getDefaultAvatar(profile?.id || name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {getCallIcon(call)}
                    <p className={`text-sm font-medium truncate ${call.status === 'missed' ? 'text-[#FF3B30]' : 'text-[#111111]'}`}>
                      {name}
                    </p>
                  </div>
                  <p className="text-[#8D8D8D] text-xs">
                    {call.type === 'video' ? 'Video' : 'Voice'} call &bull; {formatTime(call.timestamp)}
                    {call.duration ? ` \u2022 ${formatDuration(call.duration)}` : ''}
                  </p>
                </div>
<div className="flex items-center gap-1">
                  {call.type !== 'group_voice' && call.type !== 'group_video' && (
                    <>
                      <button type="button" onClick={() => navigate('/call', { state: { userId: otherId, mode: 'voice', isOutgoing: true } })}
                        className="p-2 rounded-full hover:bg-[#00C300]/10 text-[#8D8D8D] hover:text-[#00C300] transition-colors"
                        title="Voice call"
                      >
                        <Phone size={16} />
                      </button>
                      <button type="button" onClick={() => navigate('/call', { state: { userId: otherId, mode: 'video', isOutgoing: true } })}
                        className="p-2 rounded-full hover:bg-[#00C300]/10 text-[#8D8D8D] hover:text-[#00C300] transition-colors"
                        title="Video call"
                      >
                        <Video size={16} />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deleteCall(call.id);
                        toast.success('Call deleted from history.');
                      } catch {
                        toast.error('Failed to delete call.');
                      }
                    }}
                    className="p-2 rounded-full hover:bg-red-50 text-[#8D8D8D] hover:text-[#FF3B30] transition-colors"
                    title="Delete call"
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
