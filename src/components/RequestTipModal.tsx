import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Heart, Coins, Banknote, Loader, Sparkles, MessageSquare, User
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { usePremiumStore, TIP_PRESETS } from '@/store/usePremiumStore';
import { useWalletStore } from '@/store/useWalletStore';
import { toast } from 'sonner';
import { sanitizeMediaUrl } from '@/lib/utils';

interface RequestTipModalProps {
  open: boolean;
  onClose: () => void;
  toUserId: string;
  toUserName?: string;
  toUserAvatar?: string;
  contentId?: string;
  contentType?: 'post' | 'reel' | 'live' | 'story';
}

type TipCurrency = 'coins' | 'BDT' | 'USD';

const currencySymbols: Record<TipCurrency, string> = {
  coins: 'G',
  BDT: '৳',
  USD: '$',
};

export default function RequestTipModal({
  open,
  onClose,
  toUserId,
  toUserName = 'Creator',
  toUserAvatar,
  contentId,
  contentType,
}: RequestTipModalProps) {
  const { user } = useAuthStore();
  const { sendTip } = usePremiumStore();
  const { wallet } = useWalletStore();

  const [currency, setCurrency] = useState<TipCurrency>('coins');
  const [amount, setAmount] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const balance =
    currency === 'coins'
      ? wallet?.coins || 0
      : currency === 'BDT'
      ? wallet?.bdtBalance || 0
      : 0; // USD not stored in wallet demo

  const effectiveAmount = customAmount ? parseFloat(customAmount) : amount ? parseFloat(amount) : 0;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setAmount('');
        setCustomAmount('');
        setMessage('');
        setShowSuccess(false);
        setCurrency('coins');
      });
    }
  }, [open]);

  const handlePreset = (val: number) => {
    setCustomAmount('');
    setAmount(val.toString());
  };

  const handleCustomChange = (val: string) => {
    setAmount('');
    setCustomAmount(val);
  };

  const handleSend = async () => {
    if (!user) {
      toast.error('Please login first');
      return;
    }
    if (!effectiveAmount || effectiveAmount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (balance < effectiveAmount) {
      toast.error('Insufficient balance');
      return;
    }

    setSending(true);
    const success = await sendTip(
      user.id,
      user.name || 'User',
      toUserId,
      toUserName,
      effectiveAmount,
      currency,
      message,
      contentId,
      contentType
    );
    setSending(false);

    if (success) {
      setShowSuccess(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 2000);
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
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#F5F5F5] overflow-hidden flex items-center justify-center">
                {sanitizeMediaUrl(toUserAvatar) ? (
                  <img
                    src={sanitizeMediaUrl(toUserAvatar)}
                    className="w-full h-full object-cover"
                    alt="User avatar"
                  />
                ) : (
                  <User size={18} className="text-[#8D8D8D]" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#111111]">Tip {toUserName}</h3>
                <p className="text-xs text-[#8D8D8D]">Show your appreciation</p>
              </div>
            </div>
            <button type="button" onClick={onClose}
              className="p-1.5 hover:bg-[#F5F5F5] rounded-full transition-colors"
            >
              <X size={20} className="text-[#8D8D8D]" />
            </button>
          </div>

          <div className="p-4 space-y-5 overflow-y-auto flex-1">
            {/* Success State */}
            <AnimatePresence>
              {showSuccess && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-[#00C300]/10 border border-[#00C300]/30 rounded-xl p-4 text-center"
                >
                  <Sparkles size={28} className="text-[#00C300] mx-auto mb-2" />
                  <p className="text-[#111111] font-bold text-sm">Tip Sent!</p>
                  <p className="text-[#8D8D8D] text-xs mt-1">
                    You sent {currencySymbols[currency]}{effectiveAmount} to {toUserName}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {!showSuccess && (
              <>
                {/* Currency Selector */}
                <div>
                  <label className="text-[#8D8D8D] text-xs mb-2 block">Currency</label>
                  <div className="flex gap-2">
                    {([
                      { code: 'coins' as TipCurrency, icon: Coins, label: 'Gaga Coins' },
                      { code: 'BDT' as TipCurrency, icon: Banknote, label: 'BDT' },
                      { code: 'USD' as TipCurrency, icon: Coins, label: 'USD' },
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
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-[#8D8D8D]">Available</span>
                    <span className="text-[#111111] font-medium">
                      {currency === 'coins'
                        ? `${wallet?.coins || 0} coins`
                        : currency === 'BDT'
                        ? `৳${(wallet?.bdtBalance || 0).toFixed(2)}`
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* Preset Amounts */}
                <div>
                  <label className="text-[#8D8D8D] text-xs mb-2 block">Quick Amount</label>
                  <div className="grid grid-cols-3 gap-2">
                    {TIP_PRESETS.map((preset) => (
                      <button type="button" key={preset}
                        onClick={() => handlePreset(preset)}
                        className={`py-2.5 rounded-xl text-sm font-bold transition-colors ${
                          amount === preset.toString() && !customAmount
                            ? 'bg-[#00C300] text-white'
                            : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]'
                        }`}
                      >
                        {currencySymbols[currency]}{preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Amount */}
                <div>
                  <label className="text-[#8D8D8D] text-xs mb-1 block">Custom Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D] text-lg font-bold">
                      {currencySymbols[currency]}
                    </span>
                    <input
                      type="number"
                      value={customAmount}
                      onChange={(e) => handleCustomChange(e.target.value)}
                      placeholder="0"
                      className="w-full bg-[#F5F5F5] rounded-xl pl-10 pr-4 py-3 text-[#111111] text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#C7C7CC]"
                    />
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="text-[#8D8D8D] text-xs mb-1 block">Message (optional)</label>
                  <div className="relative">
                    <MessageSquare
                      size={14}
                      className="absolute left-3 top-3 text-[#8D8D8D]"
                    />
                    <input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Great content! 🔥"
                      className="w-full bg-[#F5F5F5] rounded-xl pl-9 pr-4 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#C7C7CC]"
                    />
                  </div>
                </div>

                {/* Send Button */}
                <button type="button" onClick={handleSend}
                  disabled={sending || effectiveAmount <= 0 || balance < effectiveAmount}
                  className="w-full bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl py-3.5 font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  {sending ? (
                    <Loader size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Heart size={16} className="fill-white" /> Send Tip
                    </>
                  )}
                </button>

                {balance < effectiveAmount && effectiveAmount > 0 && (
                  <p className="text-[#FF3B30] text-xs text-center">
                    Insufficient balance. You have {currencySymbols[currency]}
                    {balance.toFixed(2)}.
                  </p>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
