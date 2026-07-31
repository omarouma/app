import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HandCoins, Search, Loader, Coins, DollarSign } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useWalletStore, type CurrencyCode } from '@/store/useWalletStore';
import { useFriendStore } from '@/store/useFriendStore';
import { toast } from 'sonner';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';

interface RequestMoneyModalProps {
  open: boolean;
  onClose: () => void;
}

export default function RequestMoneyModal({ open, onClose }: RequestMoneyModalProps) {
  const { user } = useAuthStore();
  const { requestMoney } = useWalletStore();
  const { friends } = useFriendStore();
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('GAGA');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFriends = friends.filter((f) =>
    f.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedFriend = friends.find((f) => f.id === selectedFriendId);

  const handleRequest = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!selectedFriendId) {
      toast.error('Select a friend');
      return;
    }
    if (!user) {
      toast.error('Please login first');
      return;
    }

    setSending(true);
    const result = await requestMoney(
      user.id,
      user.name,
      selectedFriendId,
      numAmount,
      currency,
      note
    );
    setSending(false);

    if (result) {
      toast.success(`Requested ${currency === 'GAGA' ? numAmount + ' GAGA' : '$' + numAmount.toFixed(2)} from ${selectedFriend?.name || 'User'}`);
      setAmount('');
      setNote('');
      setSelectedFriendId('');
      onClose();
    } else {
      toast.error('Request failed');
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl overflow-hidden max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#EBEBEB] shrink-0">
            <h3 className="text-lg font-bold text-[#111111]">Request Money</h3>
            <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
              <X size={20} className="text-[#8D8D8D]" />
            </button>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Friend Selector */}
            <div>
              <label className="text-[#8D8D8D] text-xs mb-2 block">Select Friend</label>
              {selectedFriend ? (
                <div className="flex items-center gap-3 p-3 bg-[#00C300]/10 rounded-xl border border-[#00C300]/30">
                  <div className="w-10 h-10 rounded-full bg-[#F5F5F5] overflow-hidden flex items-center justify-center">
                    {sanitizeMediaUrl(selectedFriend.avatar) ? (
                      <img src={sanitizeMediaUrl(selectedFriend.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                    ) : (
                      <img src={getDefaultAvatar(selectedFriend.id)} className="w-full h-full object-cover" alt="User avatar" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-[#111111] text-sm font-medium">{selectedFriend.name}</p>
                    <p className="text-[#8D8D8D] text-xs">@{selectedFriend.username}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedFriendId('')}
                    className="text-[#8D8D8D] hover:text-[#FF3B30] text-xs"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative mb-2">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search friends..."
                      className="w-full bg-[#F5F5F5] rounded-xl pl-9 pr-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {filteredFriends.length === 0 ? (
                      <p className="text-[#8D8D8D] text-xs text-center py-2">No friends found</p>
                    ) : (
                      filteredFriends.map((f) => (
                        <button type="button" key={f.id}
                          onClick={() => setSelectedFriendId(f.id)}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F5F5F5] transition-colors text-left"
                        >
                          <div className="w-9 h-9 rounded-full bg-[#F5F5F5] overflow-hidden flex items-center justify-center">
                            {sanitizeMediaUrl(f.avatar) ? (
                              <img src={sanitizeMediaUrl(f.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                            ) : (
                              <img src={getDefaultAvatar(f.id)} className="w-full h-full object-cover" alt="User avatar" />
                            )}
                          </div>
                          <div>
                            <p className="text-[#111111] text-sm font-medium">{f.name}</p>
                            <p className="text-[#8D8D8D] text-xs">@{f.username}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Currency */}
            <div>
              <label className="text-[#8D8D8D] text-xs mb-2 block">Currency</label>
              <div className="flex gap-2">
                {([
                  { code: 'GAGA' as CurrencyCode, icon: Coins, label: 'GAGA' },
                  { code: 'USD' as CurrencyCode, icon: DollarSign, label: 'USD' },
                ]).map((c) => (
                  <button type="button" key={c.code}
                    onClick={() => setCurrency(c.code)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                      currency === c.code
                        ? 'bg-[#00C300] text-white'
                        : 'bg-[#F5F5F5] text-[#8D8D8D]'
                    }`}
                  >
                    <c.icon size={14} /> {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D] text-lg font-bold">
                  {currency === 'GAGA' ? 'G' : '$'}
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-[#F5F5F5] rounded-xl pl-10 pr-4 py-3 text-[#111111] text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#C7C7CC]"
                />
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Note (optional)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What's this for?"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#C7C7CC]"
              />
            </div>

            {/* Request Button */}
            <button type="button" onClick={handleRequest}
              disabled={sending || !amount || !selectedFriendId}
              className="w-full bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl py-3.5 font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? <Loader size={16} className="animate-spin" /> : <><HandCoins size={16} /> Request</>}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
