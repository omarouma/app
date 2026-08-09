import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, Plus, Search, Users, X, Lock, Globe,
  TrendingUp, ChevronRight, Radio, Headphones
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useVoiceRoomStore, type VoiceRoom } from '@/store/useVoiceRoomStore';
import { useFriendStore } from '@/store/useFriendStore';
import { getDefaultAvatar } from '@/lib/utils';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
const ROOM_CATEGORIES = [
  'All', 'Tech', 'Music', 'Gaming', 'Sports', 'Business',
  'Education', 'Health', 'Comedy', 'News', 'Lifestyle', 'Science'
];

export default function VoiceRoomsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { rooms, loading, subscribeRooms, createRoom, joinRoom } = useVoiceRoomStore();
  const { friends } = useFriendStore();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomTopic, setNewRoomTopic] = useState('');
  const [newRoomCategory, setNewRoomCategory] = useState('Tech');
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    const unsub = subscribeRooms();
    return () => unsub();
  }, [subscribeRooms]);

  const filtered = rooms.filter(r => {
    if (activeCategory !== 'All' && r.category !== activeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.title.toLowerCase().includes(q) || r.topic.toLowerCase().includes(q) || r.hostName.toLowerCase().includes(q);
    }
    return true;
  });

  const popularRooms = [...filtered].sort((a, b) => b.listenerCount - a.listenerCount).slice(0, 5);
  const friendRooms = filtered.filter(r => friends.some(f => f.id === r.hostId));

  const handleCreate = async () => {
    if (!user?.id || !newRoomTitle.trim()) return;
    const roomId = await createRoom(user.id, {
      title: newRoomTitle.trim(),
      description: newRoomTopic.trim(),
      topic: newRoomTopic.trim(),
      category: newRoomCategory,
      isPrivate,
      hostName: user.name || 'Host',
      hostAvatar: user.avatar,
    });
    if (roomId) {
      setShowCreateModal(false);
      setNewRoomTitle('');
      setNewRoomTopic('');
      navigate(`/voice-room/${roomId}`);
    }
  };

  const handleJoin = async (roomId: string) => {
    if (!user?.id) return;
    await joinRoom(roomId, user.id);
    navigate(`/voice-room/${roomId}`);
  };

  const formatListenerCount = (count: number) => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  };

  return (
    <div className="h-[100dvh] bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-5 py-4 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[#00C300]/20 flex items-center justify-center">
              <Radio size={18} className="text-[#00C300]" />
            </div>
            <h1 className="text-xl font-bold">Voice Rooms</h1>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#00C300] text-black rounded-full text-sm font-bold hover:bg-[#00A300] transition-colors"
          >
            <Plus size={16} /> Create
          </button>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search rooms, topics, hosts..."
            className="w-full bg-[#1a1a1a] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-[#8D8D8D] focus:outline-none focus:ring-2 focus:ring-[#00C300]/30"
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="shrink-0 flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-[#1a1a1a]">
        {ROOM_CATEGORIES.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${activeCategory === cat
                ? 'bg-[#00C300] text-black'
                : 'bg-[#1a1a1a] text-[#8D8D8D] hover:text-white'
              }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-20">
        {loading ? (
          <LoadingSkeleton count={4} variant="list" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Headphones}
            title="No live rooms"
            description="Create your own room or check back later for new ones"
            action={
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="px-5 py-2 bg-[#00C300] text-black rounded-full text-sm font-bold"
              >
                Create Room
              </button>
            }
          />
        ) : (
          <div className="space-y-4 py-4">
            {/* Trending section */}
            {popularRooms.length > 0 && !search && activeCategory === 'All' && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={16} className="text-[#FF4081]" />
                  <h2 className="text-sm font-bold text-white">Trending Now</h2>
                </div>
                <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
                  {popularRooms.map(room => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => handleJoin(room.id)}
                      className="shrink-0 w-48 bg-[#1a1a1a] rounded-xl p-3 text-left hover:bg-[#222] transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <img
                          src={room.hostAvatar || getDefaultAvatar(room.hostId)}
                          alt="Host"
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <p className="text-white text-xs font-medium truncate">{room.hostName}</p>
                          <p className="text-[#00C300] text-[10px] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-[#00C300] rounded-full animate-pulse" /> LIVE
                          </p>
                        </div>
                      </div>
                      <p className="text-white text-sm font-semibold truncate mb-1">{room.title}</p>
                      <p className="text-[#8D8D8D] text-xs truncate">{room.topic}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[#8D8D8D] text-[10px] flex items-center gap-1">
                          <Users size={10} /> {formatListenerCount(room.listenerCount)}
                        </span>
                        <span className="text-[#8D8D8D] text-[10px]">{room.category}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Friend's rooms */}
            {friendRooms.length > 0 && !search && activeCategory === 'All' && (
              <div className="mb-4">
                <h2 className="text-sm font-bold text-white mb-3">From Friends</h2>
                {friendRooms.map(room => (
                  <RoomCard key={room.id} room={room} onJoin={() => handleJoin(room.id)} />
                ))}
              </div>
            )}

            {/* All rooms */}
            <div>
              <h2 className="text-sm font-bold text-white mb-3">
                {search ? 'Search Results' : activeCategory === 'All' ? 'All Rooms' : `${activeCategory} Rooms`}
              </h2>
              <div className="space-y-2">
                {filtered.map(room => (
                  <RoomCard key={room.id} room={room} onJoin={() => handleJoin(room.id)} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>


      {/* Create Room Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[#1a1a1a] rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Create Voice Room</h2>
                <button type="button" onClick={() => setShowCreateModal(false)}>
                  <X size={20} className="text-[#8D8D8D]" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-[#8D8D8D] mb-1 block">Room Title</label>
                  <input
                    value={newRoomTitle}
                    onChange={e => setNewRoomTitle(e.target.value)}
                    placeholder="e.g., Tech Talk Tuesday"
                    maxLength={60}
                    className="w-full bg-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#8D8D8D] outline-none focus:ring-2 focus:ring-[#00C300]/30"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8D8D8D] mb-1 block">Topic</label>
                  <input
                    value={newRoomTopic}
                    onChange={e => setNewRoomTopic(e.target.value)}
                    placeholder="What's the discussion about?"
                    maxLength={100}
                    className="w-full bg-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#8D8D8D] outline-none focus:ring-2 focus:ring-[#00C300]/30"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8D8D8D] mb-1 block">Category</label>
                  <div className="flex gap-2 flex-wrap">
                    {ROOM_CATEGORIES.slice(1).map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setNewRoomCategory(cat)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${newRoomCategory === cat
                            ? 'bg-[#00C300] text-black'
                            : 'bg-[#2a2a2a] text-[#8D8D8D]'
                          }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPrivate(!isPrivate)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${isPrivate ? 'bg-[#FF4081]/20 text-[#FF4081]' : 'bg-[#2a2a2a] text-[#8D8D8D]'
                      }`}
                  >
                    {isPrivate ? <Lock size={12} /> : <Globe size={12} />}
                    {isPrivate ? 'Private' : 'Public'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newRoomTitle.trim()}
                  className="w-full py-3 bg-[#00C300] text-black rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-[#00A300] transition-colors"
                >
                  Go Live
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RoomCard({ room, onJoin }: { room: VoiceRoom; onJoin: () => void }) {
  return (
    <button
      type="button"
      onClick={onJoin}
      className="w-full bg-[#1a1a1a] rounded-xl p-3 flex items-center gap-3 text-left hover:bg-[#222] transition-colors"
    >
      <div className="relative shrink-0">
        <img
          src={room.hostAvatar || getDefaultAvatar(room.hostId)}
          alt="Host"
          className="w-12 h-12 rounded-full object-cover"
        />
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#00C300] rounded-full border-2 border-[#1a1a1a] flex items-center justify-center">
          <Mic size={8} className="text-black" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white font-semibold text-sm truncate">{room.title}</p>
          {room.isPrivate && <Lock size={12} className="text-[#FF4081] shrink-0" />}
        </div>
        <p className="text-[#8D8D8D] text-xs truncate">{room.topic || room.description}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[#00C300] text-[10px] flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-[#00C300] rounded-full animate-pulse" /> LIVE
          </span>
          <span className="text-[#8D8D8D] text-[10px] flex items-center gap-1">
            <Users size={10} /> {room.listenerCount} listening
          </span>
          <span className="text-[#8D8D8D] text-[10px]">{room.category}</span>
        </div>
      </div>
      <ChevronRight size={18} className="text-[#8D8D8D] shrink-0" />
    </button>
  );
}
