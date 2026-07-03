import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Split, Search, Loader, Coins, Banknote, DollarSign, Check, Users } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useWalletStore, type CurrencyCode } from '@/store/useWalletStore';
import { useFriendStore } from '@/store/useFriendStore';
import { toast } from 'sonner';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';

interface SplitBillModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SplitBillModal({ open, onClose }: SplitBillModalProps) {
  const { user } = useAuthStore();
  const { splitBill } = useWalletStore();
  const { friends } = useFriendStore();
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [currency, setCurrency] = useState<CurrencyCode>('GAGA');
  const [totalAmount, setTotalAmount] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFriends = friends.filter((f) =>
    f.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleFriend = (id: string) => {
    const next = new Set(selectedFriendIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedFriendIds(next);
  };

  const perPerson = selectedFriendIds.size > 0
    ? Math.round((parseFloat(totalAmount || '0') / (selectedFriendIds.size + 1)) * 100) / 100
    : 0;

  const handleSplit = async () => {
    const numAmount = parseFloat(totalAmount);
    if (!numAmount || numAmount <= 0) {
      toast.error('Enter a valid total amount');
      return;
    }
    if (selectedFriendIds.size === 0) {
      toast.error('Select at least one friend');
      return;
    }
    if (!user) {
      toast.error('Please login first');
      return;
    }
    if (!description.trim()) {
      toast.error('Enter a description');
      return;
    }

    setSending(true);
    const result = await splitBill(
      user.id,
      Array.from(selectedFriendIds),
      numAmount,
      currency,
      description.trim()
    );
    setSending(false);

    if (result) {
      toast.success(`Split ${currency === 'GAGA' ? numAmount + ' GAGA' : currency === 'BDT' ? '৳' + numAmount : '$' + numAmount} with ${selectedFriendIds.size} friend${selectedFriendIds.size > 1 ? 's' : ''}`);
      setTotalAmount('');
      setDescription('');
      setSelectedFriendIds(new Set());
      onClose();
    } else {
      toast.error('Split bill failed');
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
            <h3 className="text-lg font-bold text-[#111111]">Split Bill</h3>
            <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
              <X size={20} className="text-[#8D8D8D]" />
            </button>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Description */}
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">What is this for?</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Dinner, Taxi, Movie tickets"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#C7C7CC]"
              />
            </div>

            {/* Currency */}
            <div>
              <label className="text-[#8D8D8D] text-xs mb-2 block">Currency</label>
              <div className="flex gap-2">
                {([
                  { code: 'GAGA' as CurrencyCode, icon: Coins, label: 'GAGA' },
                  { code: 'BDT' as CurrencyCode, icon: Banknote, label: 'BDT' },
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

            {/* Total Amount */}
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Total Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D] text-lg font-bold">
                  {currency === 'GAGA' ? 'G' : currency === 'BDT' ? '৳' : '$'}
                </span>
                <input
                  type="number"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-[#F5F5F5] rounded-xl pl-10 pr-4 py-3 text-[#111111] text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#C7C7CC]"
                />
              </div>
            </div>

            {/* Per Person Summary */}
            {selectedFriendIds.size > 0 && totalAmount && (
              <div className="bg-[#00C300]/10 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-[#00C300]" />
                  <span className="text-[#111111] text-sm font-medium">
                    {selectedFriendIds.size + 1} people
                  </span>
                </div>
                <span className="text-[#00C300] font-bold">
                  {currency === 'GAGA' ? perPerson.toFixed(2) + ' GAGA' : currency === 'BDT' ? '৳' + perPerson.toFixed(2) : '$' + perPerson.toFixed(2)} each
                </span>
              </div>
            )}

            {/* Friend Selector */}
            <div>
              <label className="text-[#8D8D8D] text-xs mb-2 block">
                Select Friends ({selectedFriendIds.size} selected)
              </label>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search friends..."
                  className="w-full bg-[#F5F5F5] rounded-xl pl-9 pr-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredFriends.length === 0 ? (
                  <p className="text-[#8D8D8D] text-xs text-center py-2">No friends found</p>
                ) : (
                  filteredFriends.map((f) => {
                    const selected = selectedFriendIds.has(f.id);
                    return (
                      <button type="button" key={f.id}
                        onClick={() => toggleFriend(f.id)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${
                          selected ? 'bg-[#00C300]/10 border border-[#00C300]/30' : 'hover:bg-[#F5F5F5]'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-full bg-[#F5F5F5] overflow-hidden flex items-center justify-center shrink-0">
                          {sanitizeMediaUrl(f.avatar) ? (
                            <img src={sanitizeMediaUrl(f.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                          ) : (
                            <img src={getDefaultAvatar(f.id)} className="w-full h-full object-cover" alt="User avatar" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[#111111] text-sm font-medium truncate">{f.name}</p>
                          <p className="text-[#8D8D8D] text-xs">@{f.username}</p>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            selected ? 'bg-[#00C300] border-[#00C300]' : 'border-[#C7C7CC]'
                          }`}
                        >
                          {selected && <Check size={12} className="text-white" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Split Button */}
            <button type="button" onClick={handleSplit}
              disabled={sending || !totalAmount || selectedFriendIds.size === 0}
              className="w-full bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl py-3.5 font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? <Loader size={16} className="animate-spin" /> : <><Split size={16} /> Split Bill</>}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
