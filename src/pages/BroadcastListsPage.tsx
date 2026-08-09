import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Plus, Users, Trash2, Check, X, ChevronRight, Search, Send, Loader
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { toast } from 'sonner';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import type { BroadcastList } from '@/types';

export default function BroadcastListsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { friends, loadingFriends, subscribeFriends, getBroadcastLists, createBroadcastList, deleteBroadcastList, sendBroadcast } = useFriendStore();
  const [lists, setLists] = useState<BroadcastList[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [selectedList, setSelectedList] = useState<BroadcastList | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [listName, setListName] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeFriends(user.id);
    return () => unsub();
  }, [user?.id, subscribeFriends]);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      setLoadingLists(true);
      const data = await getBroadcastLists(user.id);
      setLists(data || []);
      setLoadingLists(false);
    };
    load();
  }, [user?.id, getBroadcastLists]);

  const handleCreate = async () => {
    if (!user?.id || !listName.trim() || selectedFriends.length === 0) {
      toast.error('Please enter a name and select at least one recipient');
      return;
    }
    const id = await createBroadcastList(user.id, listName.trim(), selectedFriends);
    if (id) {
      toast.success('Broadcast list created');
      setShowCreate(false);
      setListName('');
      setSelectedFriends([]);
      const data = await getBroadcastLists(user.id);
      setLists(data || []);
    }
  };

  const handleDelete = async (listId: string) => {
    await deleteBroadcastList(listId);
    toast.success('Broadcast list deleted');
    setDeleteConfirm(null);
    if (user?.id) {
      const data = await getBroadcastLists(user.id);
      setLists(data || []);
    }
  };

  const handleSendBroadcast = async () => {
    if (!user?.id || !selectedList || !broadcastMessage.trim()) return;
    setSendingBroadcast(true);
    const recipientIds = selectedList.recipientIds || [];
    await sendBroadcast(user.id, recipientIds, broadcastMessage.trim());
    setSendingBroadcast(false);
    setShowSend(false);
    setBroadcastMessage('');
    setSelectedList(null);
  };

  const openSendModal = (list: BroadcastList) => {
    setSelectedList(list);
    setShowSend(true);
  };

  const toggleFriend = (id: string) => {
    setSelectedFriends(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const filteredFriends = friends.filter(f => {
    const q = friendSearch.toLowerCase();
    return f.name?.toLowerCase().includes(q) || f.username?.toLowerCase().includes(q);
  });

  return (
    <div className="h-[100dvh] bg-[#F5F5F5] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-[#EBEBEB] shrink-0">
        <div className="flex items-center gap-3 p-4">
          <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-[#F5F5F5] rounded-full text-[#111111]">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-bold text-[#111111] flex-1">Broadcast Lists</h1>
          <button type="button" onClick={() => setShowCreate(true)} className="p-2 hover:bg-[#F5F5F5] rounded-full text-[#00C300]">
            <Plus size={22} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loadingLists ? (
          <LoadingSkeleton count={3} variant="list" />
        ) : lists.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No broadcast lists"
            description="Create a broadcast list to send messages to multiple contacts at once"
            action={
              <button type="button" onClick={() => setShowCreate(true)}
                className="px-4 py-2 bg-[#00C300] text-white rounded-full text-sm font-medium"
              >
                New Broadcast List
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            {lists.map((list, i) => (
              <motion.div
                key={list.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden"
              >
                <div className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-full bg-[#00C300]/10 flex items-center justify-center shrink-0">
                    <Users size={18} className="text-[#00C300]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#111111] text-sm font-medium truncate">{list.name}</p>
                    <p className="text-[#8D8D8D] text-xs">{(list.recipientIds || []).length} recipients</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openSendModal(list)}
                      className="px-3 py-1.5 bg-[#00C300] text-white rounded-full text-xs font-medium hover:bg-[#00A300] transition-colors"
                    >
                      Send
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(list.id)}
                      className="p-2 hover:bg-[#FF3B30]/10 rounded-full text-[#FF3B30] transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                    <ChevronRight size={16} className="text-[#C7C7CC]" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create Broadcast List Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm max-h-[85vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b border-[#EBEBEB] flex items-center justify-between shrink-0">
                <h3 className="text-lg font-bold text-[#111111]">New Broadcast List</h3>
                <button type="button" onClick={() => setShowCreate(false)} className="p-2 hover:bg-[#F5F5F5] rounded-full">
                  <X size={20} className="text-[#8D8D8D]" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="text-[#8D8D8D] text-xs mb-1 block">List Name</label>
                  <input
                    value={listName}
                    onChange={e => setListName(e.target.value)}
                    placeholder="e.g., Team, Family, Work"
                    className="w-full bg-[#F5F5F5] rounded-xl px-4 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
                  />
                </div>

                <div>
                  <label className="text-[#8D8D8D] text-xs mb-1 block">
                    Select Recipients ({selectedFriends.length} selected)
                  </label>
                  <div className="bg-[#F5F5F5] rounded-xl p-2.5 flex items-center gap-2 mb-2">
                    <Search size={16} className="text-[#8D8D8D] ml-1" />
                    <input
                      type="text"
                      placeholder="Search friends..."
                      value={friendSearch}
                      onChange={e => setFriendSearch(e.target.value)}
                      className="bg-transparent border-none focus:outline-none text-[15px] w-full text-[#111111] placeholder-[#8D8D8D]"
                    />
                  </div>

                  {loadingFriends ? (
                    <LoadingSkeleton count={3} variant="list" />
                  ) : filteredFriends.length === 0 ? (
                    <p className="text-[#8D8D8D] text-sm text-center py-4">No friends found</p>
                  ) : (
                    <div className="space-y-1">
                      {filteredFriends.map(f => {
                        const isSelected = selectedFriends.includes(f.id);
                        return (
                          <button
                            type="button"
                            key={f.id}
                            onClick={() => toggleFriend(f.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${isSelected ? 'bg-[#00C300]/10 border border-[#00C300]/20' : 'hover:bg-[#F5F5F5]'
                              }`}
                          >
                            <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden shrink-0">
                              {sanitizeMediaUrl(f.avatar) ? (
                                <img src={sanitizeMediaUrl(f.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                              ) : (
                                <img src={getDefaultAvatar(f.id || f.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[#111111] text-sm font-medium">{f.name}</p>
                              <p className="text-[#8D8D8D] text-xs">@{f.username}</p>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-[#00C300] bg-[#00C300]' : 'border-[#C7C7CC]'
                              }`}>
                              {isSelected && <Check size={12} className="text-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-[#EBEBEB] shrink-0">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!listName.trim() || selectedFriends.length === 0}
                  className="w-full py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors"
                >
                  Create List
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Send Broadcast Modal */}
      <AnimatePresence>
        {showSend && selectedList && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowSend(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm max-h-[85vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b border-[#EBEBEB] flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-[#111111]">Send Broadcast</h3>
                  <p className="text-[#8D8D8D] text-xs">{selectedList.name} · {(selectedList.recipientIds || []).length} recipients</p>
                </div>
                <button type="button" onClick={() => setShowSend(false)} className="p-2 hover:bg-[#F5F5F5] rounded-full">
                  <X size={20} className="text-[#8D8D8D]" />
                </button>
              </div>

              <div className="p-4 flex-1 overflow-y-auto">
                <textarea
                  value={broadcastMessage}
                  onChange={e => setBroadcastMessage(e.target.value)}
                  placeholder="Type your broadcast message..."
                  rows={5}
                  className="w-full bg-[#F5F5F5] rounded-xl px-4 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D] resize-none"
                />
                <p className="text-[#8D8D8D] text-xs mt-2">
                  This will be sent as a separate message to each recipient.
                </p>
              </div>

              <div className="p-4 border-t border-[#EBEBEB] shrink-0">
                <button
                  type="button"
                  onClick={handleSendBroadcast}
                  disabled={!broadcastMessage.trim() || sendingBroadcast}
                  className="w-full py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {sendingBroadcast ? (
                    <>
                      <Loader size={16} className="animate-spin" /> Sending...
                    </>
                  ) : (
                    <>
                      <Send size={16} /> Send to {(selectedList.recipientIds || []).length} recipients
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-2">Delete Broadcast List?</h3>
              <p className="text-[#8D8D8D] text-sm mb-4">This action cannot be undone.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
                >
                  Cancel
                </button>
                <button type="button" onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-3 bg-[#FF3B30] text-white rounded-xl text-sm font-bold"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
