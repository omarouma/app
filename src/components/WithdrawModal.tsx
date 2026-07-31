import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';
import { useWalletStore } from '@/store/useWalletStore';
import { useAuthStore } from '@/store/useAuthStore';

interface WithdrawModalProps {
  open: boolean;
  onClose: () => void;
}

export default function WithdrawModal({ open, onClose }: WithdrawModalProps) {
  const [method, setMethod] = useState<'paypal'>('paypal');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [confirming, setConfirming] = useState(false);
  const { withdraw, wallet } = useWalletStore();
  const { user } = useAuthStore();

  const usdAmount = Number(amount) || 0;
  const canWithdraw = wallet && usdAmount >= 5 && usdAmount <= (wallet.usdBalance || 0);

  const handleWithdraw = async () => {
    if (!user || !canWithdraw) return;
    if (!confirming) { setConfirming(true); return; }
    await withdraw(user.id, usdAmount, 'USD', method.toUpperCase(), email);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="bg-white rounded-2xl w-full max-w-md border border-[#EBEBEB] p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[#111111] font-semibold text-lg">Withdraw GagaCoin</h3>
              <button type="button" onClick={onClose} className="text-[#8D8D8D] hover:text-[#111111] p-1">
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              {(['paypal'] as const).map(m => (
                <button type="button" key={m}
                  onClick={() => setMethod(m)}
                  className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${
                    method === m ? 'border-[#00C300] bg-[#00C300]/5 text-[#00C300]' : 'border-[#EBEBEB] text-[#8D8D8D] hover:border-[#C7C7CC]'
                  }`}
                >
                  {m === 'paypal' ? 'PayPal' : m}
                </button>
              ))}
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-[#8D8D8D] text-xs mb-1 block">PayPal Email</label>
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-[#F5F5F5] border border-[#EBEBEB] rounded-xl px-4 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                />
              </div>
              <div>
                <label className="text-[#8D8D8D] text-xs mb-1 block">Amount (USD)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="Minimum 5"
                  className="w-full bg-[#F5F5F5] border border-[#EBEBEB] rounded-xl px-4 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                />
              </div>
            </div>

            {usdAmount > 0 && (
              <div className="bg-[#F5F5F5] rounded-xl p-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#8D8D8D]">Amount</span>
                  <span className="text-[#111111] font-medium">{`$${usdAmount.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#8D8D8D]">Method</span>
                  <span className="text-[#111111] font-medium">{method.toUpperCase()}</span>
                </div>
                <div className="border-t border-[#EBEBEB] pt-2 flex justify-between">
                  <span className="text-[#111111] font-medium">Total</span>
                  <span className="text-[#00C300] font-bold">{`$${usdAmount.toFixed(2)} USD`}</span>
                </div>
              </div>
            )}

            {usdAmount > 0 && !canWithdraw && (
              <div className="flex items-center gap-2 bg-[#FF3B30]/10 rounded-xl p-3 mb-4 text-[#FF3B30] text-xs">
                <AlertTriangle size={14} />
                {usdAmount < 5 ? 'Minimum $5 USD required' : 'Insufficient balance'}
              </div>
            )}

            <button type="button" onClick={handleWithdraw}
              disabled={!canWithdraw}
              className="w-full bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl py-3 font-bold text-sm transition-colors disabled:opacity-50"
            >
              {confirming ? 'Confirm Withdraw' : 'Withdraw'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
