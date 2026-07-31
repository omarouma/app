import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Search, UserPlus, Star, StarOff, Trash2, Phone, Video, X, Ban, MessageCircle, QrCode, MapPin } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useFilteredOnline } from '@/hooks/usePresence';
import { useNavigate } from 'react-router-dom';
import EmptyState from '@/components/EmptyState';
import { getDefaultAvatar, sanitizeMediaUrl, formatTime } from '@/lib/utils';
import { toast } from 'sonner';

export default function DesktopContactsView() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    friends, requests, sentRequests, blockedUsers,
    loadingFriends, loadingSentRequests, loadingBlocked,
    subscribeFriends, subscribeSentRequests, subscribeBlockedUsers,
    toggleFavorite, removeFriend, acceptRequest, rejectRequest,
    cancelRequest, blockUser, unblockUser,
  } = useFriendStore();
  const { filtered: visibleOnline } = useFilteredOnline(user?.id || '', friends);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'favorites' | 'requests' | 'sent' | 'blocked'>('all');
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  // Real-time subscriptions for all data
  useEffect(() => {
    if (!user?.id) return;
    const unsubFriends = subscribeFriends(user.id);
    const unsubSent = subscribeSentRequests(user.id);
    const unsubBlocked = subscribeBlockedUsers(user.id);
    return () => { unsubFriends(); unsubSent(); unsubBlocked(); };
  }, [user?.id, subscribeFriends, subscribeSentRequests, subscribeBlockedUsers]);

  const filtered = friends.filter(f => {
    const match = f.name?.toLowerCase().includes(search.toLowerCase()) || f.username?.toLowerCase().includes(search.toLowerCase());
    if (tab === 'favorites') return match && user?.favorites?.includes(f.id);
    return match;
  });

  const handleBlock = async (friendId: string) => {
    if (!user?.id) return;
    try {
      await blockUser(friendId, user.id);
      toast.success('User blocked');
      setActionMenu(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to block user');
    }
  };

  const handleCancel = async (requestId: string) => {
    try {
      await cancelRequest(requestId);
      toast.success('Request cancelled');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel request');
    }
  };

  const tabLabels = {
    all: `All (${friends.length})`,
    favorites: 'Favorites',
    requests: `Requests (${requests.length})`,
    sent: `Sent (${sentRequests.length})`,
    blocked: `Blocked (${blockedUsers.length})`,
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="shrink-0 p-4 border-b border-[#EBEBEB]">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-[#111111] flex items-center gap-2">
            <Users size={20} className="text-[#00C300]" /> Contacts
          </h1>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate('/qr-scanner')}
              className="flex items-center gap-2 px-3 py-2 bg-[#F5F5F5] text-[#111111] text-sm font-medium rounded-full hover:bg-[#EBEBEB] transition-colors"
              title="Scan QR Code"
            >
              <QrCode size={16} />
            </button>
            <button type="button" onClick={() => navigate('/add-friends')}
              className="flex items-center gap-2 px-3 py-2 bg-[#F5F5F5] text-[#111111] text-sm font-medium rounded-full hover:bg-[#EBEBEB] transition-colors"
              title="Find Nearby"
            >
              <MapPin size={16} />
            </button>
            <button type="button" onClick={() => navigate('/add-friends')}
              className="flex items-center gap-2 px-4 py-2 bg-[#00C300] text-white text-sm font-medium rounded-full hover:bg-[#00A300] transition-colors"
            >
              <UserPlus size={16} /> Add Friend
            </button>
          </div>
        </div>
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search friends..."
            className="w-full bg-[#F5F5F5] border-none rounded-xl pl-10 pr-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'favorites', 'requests', 'sent', 'blocked'] as const).map(t => (
            <button type="button" key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tab === t ? 'bg-[#00C300] text-white' : 'bg-[#F5F5F5] text-[#8D8D8D] hover:text-[#111111]'
              }`}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <AnimatePresence mode="wait">
          {/* Requests Tab */}
          {tab === 'requests' && (
            <motion.div key="requests" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-2">
              {requests.length === 0 ? (
                <EmptyState icon={UserPlus} title="No pending requests" description="Friend requests will appear here" />
              ) : (
                requests.map((req, i) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-4 bg-[#F5F5F5] rounded-xl"
                  >
                    <img
                      src={sanitizeMediaUrl(req.fromUser?.avatar) || getDefaultAvatar(req.fromUser?.id || req.from)}
                      alt="User avatar"
                      className="w-10 h-10 rounded-full object-cover shrink-0 bg-white"
                      onError={(e) => { (e.target as HTMLImageElement).src = getDefaultAvatar(req.from); }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[#111111] text-sm font-medium truncate">{req.fromUser?.name || req.from}</p>
                      <p className="text-[#8D8D8D] text-xs truncate">@{req.fromUser?.username || 'user'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={async () => {
                          try { await acceptRequest(req.id); toast.success('Friend request accepted'); }
                          catch { toast.error('Failed to accept request'); }
                        }}
                        className="px-4 py-2 bg-[#00C300] text-white text-sm rounded-full font-medium hover:bg-[#00A300] transition-colors"
                      >
                        Accept
                      </button>
                      <button type="button" onClick={async () => {
                          try { await rejectRequest(req.id); toast.success('Request declined'); }
                          catch { toast.error('Failed to decline request'); }
                        }}
                        className="px-4 py-2 bg-white text-[#8D8D8D] text-sm rounded-full hover:bg-gray-100 transition-colors"
                      >
                        Decline
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}

          {/* Sent Requests Tab */}
          {tab === 'sent' && (
            <motion.div key="sent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-2">
              {loadingSentRequests ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-10 h-10 rounded-full bg-[#F5F5F5]" />
                      <div className="flex-1"><div className="h-3 bg-[#F5F5F5] rounded w-1/3 mb-1" /><div className="h-2 bg-[#F5F5F5] rounded w-1/2" /></div>
                    </div>
                  ))}
                </div>
              ) : sentRequests.length === 0 ? (
                <EmptyState icon={UserPlus} title="No sent requests" description="Requests you send will appear here" />
              ) : (
                sentRequests.map((req, i) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-4 bg-[#F5F5F5] rounded-xl"
                  >
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden">
                      {sanitizeMediaUrl(req.toUser?.avatar) ? (
                        <img src={sanitizeMediaUrl(req.toUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                      ) : (
                        <img src={getDefaultAvatar(req.toUser?.id || req.toUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#111111] text-sm font-medium">{req.toUser?.name || 'User'}</p>
                      <p className="text-[#8D8D8D] text-xs">@{req.toUser?.username || req.toUserId?.slice(0, 8)}</p>
                      <p className="text-[#8D8D8D] text-[10px] mt-0.5">Sent {formatTime(req.timestamp)}</p>
                    </div>
                    <button type="button" onClick={() => handleCancel(req.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-white text-[#FF3B30] text-xs rounded-full font-medium hover:bg-gray-100 transition-colors"
                    >
                      <X size={12} /> Cancel
                    </button>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}

          {/* Blocked Users Tab */}
          {tab === 'blocked' && (
            <motion.div key="blocked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-2">
              {loadingBlocked ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-10 h-10 rounded-full bg-[#F5F5F5]" />
                      <div className="flex-1"><div className="h-3 bg-[#F5F5F5] rounded w-1/3 mb-1" /><div className="h-2 bg-[#F5F5F5] rounded w-1/2" /></div>
                    </div>
                  ))}
                </div>
              ) : blockedUsers.length === 0 ? (
                <EmptyState icon={Ban} title="No blocked users" description="Blocked users will appear here" />
              ) : (
                blockedUsers.map((record, i) => (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-4 bg-[#F5F5F5] rounded-xl"
                  >
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden">
                      {sanitizeMediaUrl(record.blockedUser?.avatar) ? (
                        <img src={sanitizeMediaUrl(record.blockedUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                      ) : (
                        <img src={getDefaultAvatar(record.blockedUser?.id || record.blockedUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#111111] text-sm font-medium">{record.blockedUser?.name || 'User'}</p>
                      <p className="text-[#8D8D8D] text-xs">@{record.blockedUser?.username || record.blockedId?.slice(0, 8)}</p>
                      {record.reason && <p className="text-[#8D8D8D] text-[10px] mt-0.5 truncate">Reason: {record.reason}</p>}
                    </div>
                    <button type="button" onClick={async () => {
                        try { await unblockUser(record.blockedId, user?.id || ''); toast.success('User unblocked'); }
                        catch { toast.error('Failed to unblock user'); }
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-white text-[#00C300] text-xs rounded-full font-medium hover:bg-gray-100 transition-colors"
                    >
                      <UserPlus size={12} /> Unblock
                    </button>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}

          {/* All / Favorites Tab */}
          {(tab === 'all' || tab === 'favorites') && (
            <motion.div key="friends" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {loadingFriends ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
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
                  icon={Users}
                  title={tab === 'favorites' ? 'No favorites yet' : 'No friends yet'}
                  description={tab === 'favorites' ? 'Star friends to add them here' : 'Add friends to get started'}
                />
              ) : (
                filtered.map((friend, i) => {
                  const isFav = user?.favorites?.includes(friend.id);
                  const isOnline = visibleOnline[friend.id];
                  const showMenu = actionMenu === friend.id;

                  return (
                    <motion.div
                      key={friend.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="relative"
                    >
                      <button type="button" onClick={() => setActionMenu(showMenu ? null : friend.id)}
                        className="w-full flex items-center gap-3 p-4 hover:bg-[#F5F5F5] transition-colors text-left"
                      >
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden shrink-0">
                            {sanitizeMediaUrl(friend.avatar) ? (
                              <img src={sanitizeMediaUrl(friend.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                            ) : (
                              <img src={getDefaultAvatar(friend.id || friend.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                            )}
                          </div>
                          {isOnline && (
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#00C300] rounded-full border-2 border-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-[#111111] text-sm font-medium">{friend.name || 'User'}</p>
                            {isFav && <Star size={12} className="text-[#00C300] fill-current" />}
                          </div>
                          <p className="text-[#8D8D8D] text-xs">
                            {friend.statusMessage || (isOnline ? 'Online' : 'Offline')}
                          </p>
                        </div>
                      </button>

                      <AnimatePresence>
                        {showMenu && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden bg-white border-t border-[#EBEBEB]"
                          >
                            <div className="flex gap-2 px-14 py-2">
                              <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/chat/${friend.id}`); }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-[#00C300]/10 text-[#00C300] text-xs rounded-full font-medium hover:bg-[#00C300]/20 transition-colors"
                              >
                                <MessageCircle size={12} /> Message
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); navigate('/call', { state: { userId: friend.id, mode: 'voice' } }); }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-[#2196F3]/10 text-[#2196F3] text-xs rounded-full font-medium hover:bg-[#2196F3]/20 transition-colors"
                              >
                                <Phone size={12} /> Voice
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); navigate('/call', { state: { userId: friend.id, mode: 'video' } }); }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-[#8B5CF6]/10 text-[#8B5CF6] text-xs rounded-full font-medium hover:bg-[#8B5CF6]/20 transition-colors"
                              >
                                <Video size={12} /> Video
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); toggleFavorite(friend.id, user?.id || '', user?.favorites || []); }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-[#FF9800]/10 text-[#FF9800] text-xs rounded-full font-medium hover:bg-[#FF9800]/20 transition-colors"
                              >
                                {isFav ? <><StarOff size={12} /> Unstar</> : <><Star size={12} /> Star</>}
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); handleBlock(friend.id); }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-[#FF3B30]/10 text-[#FF3B30] text-xs rounded-full font-medium hover:bg-[#FF3B30]/20 transition-colors"
                              >
                                <Ban size={12} /> Block
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); removeFriend(friend.id, user?.id || ''); setActionMenu(null); }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-[#FF3B30]/10 text-[#FF3B30] text-xs rounded-full font-medium hover:bg-[#FF3B30]/20 transition-colors"
                              >
                                <Trash2 size={12} /> Remove
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
