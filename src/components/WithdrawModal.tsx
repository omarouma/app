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
  const [method, setMethod] = useState<'nagad' | 'bkash' | 'paypal'>('nagad');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [confirming, setConfirming] = useState(false);
  const { withdraw, wallet } = useWalletStore();
  const { user } = useAuthStore();

  const bdtAmount = Number(amount) || 0;
  const canWithdraw = wallet && bdtAmount >= 50 && bdtAmount <= wallet.bdtBalance;

  const handleWithdraw = async () => {
    if (!user || !canWithdraw) return;
    if (!confirming) { setConfirming(true); return; }
    await withdraw(user.id, bdtAmount, 'BDT', method.toUpperCase(), phone);
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
              {(['nagad', 'bkash', 'paypal'] as const).map(m => (
                <button type="button" key={m}
                  onClick={() => setMethod(m)}
                  className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${
                    method === m ? 'border-[#00C300] bg-[#00C300]/5 text-[#00C300]' : 'border-[#EBEBEB] text-[#8D8D8D] hover:border-[#C7C7CC]'
                  }`}
                >
                  {m === 'nagad' ? 'Nagad' : m === 'bkash' ? 'bKash' : 'PayPal'}
                </button>
              ))}
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-[#8D8D8D] text-xs mb-1 block">Phone / Account</label>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder={method === 'paypal' ? 'PayPal email' : '01XXXXXXXXX'}
                  className="w-full bg-[#F5F5F5] border border-[#EBEBEB] rounded-xl px-4 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                />
              </div>
              <div>
                <label className="text-[#8D8D8D] text-xs mb-1 block">Amount (BDT)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="Minimum 50"
                  className="w-full bg-[#F5F5F5] border border-[#EBEBEB] rounded-xl px-4 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                />
              </div>
            </div>

            {bdtAmount > 0 && (
              <div className="bg-[#F5F5F5] rounded-xl p-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#8D8D8D]">Amount</span>
                  <span className="text-[#111111] font-medium">{`\u09F3${bdtAmount.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#8D8D8D]">Method</span>
                  <span className="text-[#111111] font-medium">{method.toUpperCase()}</span>
                </div>
                <div className="border-t border-[#EBEBEB] pt-2 flex justify-between">
                  <span className="text-[#111111] font-medium">Total</span>
                  <span className="text-[#00C300] font-bold">{`\u09F3${bdtAmount.toFixed(2)} BDT`}</span>
                </div>
              </div>
            )}

            {bdtAmount > 0 && !canWithdraw && (
              <div className="flex items-center gap-2 bg-[#FF3B30]/10 rounded-xl p-3 mb-4 text-[#FF3B30] text-xs">
                <AlertTriangle size={14} />
                {bdtAmount < 50 ? 'Minimum \u09F350 BDT required' : 'Insufficient balance'}
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
