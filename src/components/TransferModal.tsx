import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Coins, Banknote, Send, Loader } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useWalletStore } from '@/store/useWalletStore';

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  chatId: string;
  toUserId: string;
  toUserName?: string;
}

type TransferType = 'coins' | 'usd';

export default function TransferModal({ open, onClose, chatId, toUserId, toUserName }: TransferModalProps) {
  const { user } = useAuthStore();
  const { wallet, sendFromChat } = useWalletStore();
  const [tab, setTab] = useState<TransferType>('coins');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const coins = wallet?.coins || 0;
  const usd = wallet?.usdBalance || wallet?.bdtBalance || 0;

  const handleSend = async () => {
    setError(''); setSuccess('');
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) { setError('Enter a valid amount'); return; }
    if (!user) { setError('Please login first'); return; }

    setSending(true);
    let result = false;
    if (tab === 'coins') {
      if (numAmount > coins) { setError('Insufficient coins'); setSending(false); return; }
      result = await sendFromChat(user.id, user.name || 'User', chatId, toUserId, numAmount, 'GAGA', note);
    } else {
      if (numAmount > usd) { setError('Insufficient USD balance'); setSending(false); return; }
      result = await sendFromChat(user.id, user.name || 'User', chatId, toUserId, numAmount, 'USD', note);
    }
    setSending(false);
    if (result) {
      setSuccess(`${tab === 'coins' ? numAmount + ' Gaga Coins' : '$' + numAmount.toFixed(2) + ' USD'} sent!`);
      setAmount('');
      setNote('');
      setTimeout(() => { setSuccess(''); onClose(); }, 1500);
    } else {
      setError('Transfer failed. Please try again.');
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
          className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#EBEBEB]">
            <h3 className="text-lg font-bold text-[#111111]">Send to {toUserName || 'User'}</h3>
            <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
              <X size={20} className="text-[#8D8D8D]" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#EBEBEB]">
            <button type="button" onClick={() => { setTab('coins'); setError(''); setSuccess(''); }}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                tab === 'coins' ? 'text-[#00C300] border-b-2 border-[#00C300]' : 'text-[#8D8D8D]'
              }`}
            >
              <Coins size={16} /> Gaga Coins
            </button>
            <button type="button" onClick={() => { setTab('usd'); setError(''); setSuccess(''); }}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                tab === 'usd' ? 'text-[#00C300] border-b-2 border-[#00C300]' : 'text-[#8D8D8D]'
              }`}
            >
              <Banknote size={16} /> USD
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Balance */}
            <div className="bg-[#F5F5F5] rounded-xl p-3 flex items-center justify-between">
              <span className="text-[#8D8D8D] text-sm">Available</span>
              <span className="text-[#111111] font-bold">
                {tab === 'coins' ? `${coins} coins` : `$${usd.toFixed(2)}`}
              </span>
            </div>

            {/* Amount Input */}
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D] text-lg">
                  {tab === 'coins' ? '\u20BF' : '$'}
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
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
                onChange={e => setNote(e.target.value)}
                placeholder="What's this for?"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#C7C7CC]"
              />
            </div>

            {/* Error/Success */}
            {error && <p className="text-[#FF3B30] text-xs">{error}</p>}
            {success && <p className="text-[#00C300] text-xs font-medium">{success}</p>}

            {/* Send Button */}
            <button type="button" onClick={handleSend}
              disabled={sending || !amount}
              className="w-full bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl py-3.5 font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? <Loader size={16} className="animate-spin" /> : <><Send size={16} /> Send {tab === 'coins' ? 'Coins' : 'USD'}</>}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
