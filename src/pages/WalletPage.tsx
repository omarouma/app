import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Coins, TrendingUp, TrendingDown, Gift, ChevronRight,
  History, Banknote, ArrowRightLeft, Plus, Minus, CreditCard,
  Loader, Shield, Lock, Unlock, Percent, Sparkles, Award,
  Copy, Check, Send, HandCoins, Split
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useWalletStore, STAKING_TIERS, getStakingTier, convertCurrency, formatCurrency, getCurrencySymbol, type CurrencyCode } from '@/store/useWalletStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import WalletPinLock from '@/components/WalletPinLock';
import SendToFriendModal from '@/components/SendToFriendModal';
import RequestMoneyModal from '@/components/RequestMoneyModal';
import SplitBillModal from '@/components/SplitBillModal';

const promoCodes: Record<string, { coins: number; label: string }> = {
  'GAGA100': { coins: 100, label: 'Welcome Bonus' },
  'REFER20': { coins: 20, label: 'Referral Reward' },
  'BONUS50': { coins: 50, label: 'Extra Bonus' },
  'GAGA500': { coins: 500, label: 'Mega Bonus' },
};

const depositMethods = [
  { icon: CreditCard, label: 'Visa/Mastercard', color: 'bg-[#1A1F71]', currency: 'USD' as CurrencyCode },
  { icon: Banknote, label: 'Bank Transfer', color: 'bg-[#00C300]', currency: 'USD' as CurrencyCode },
  { icon: Banknote, label: 'bKash', color: 'bg-[#E2136E]', currency: 'BDT' as CurrencyCode },
  { icon: Banknote, label: 'Nagad', color: 'bg-[#F6921E]', currency: 'BDT' as CurrencyCode },
  { icon: Banknote, label: 'Rocket', color: 'bg-[#8C3494]', currency: 'BDT' as CurrencyCode },
  { icon: CreditCard, label: 'WeChat Pay', color: 'bg-[#07C160]', currency: 'RMB' as CurrencyCode },
  { icon: CreditCard, label: 'Alipay', color: 'bg-[#1677FF]', currency: 'RMB' as CurrencyCode },
  { icon: CreditCard, label: 'UPI', color: 'bg-[#2196F3]', currency: 'INR' as CurrencyCode },
];

// All supported currencies for the wallet
const ALL_CURRENCIES: { code: CurrencyCode; label: string; color: string }[] = [
  { code: 'GAGA', label: 'Gaga Coins', color: 'text-[#00C300]' },
  { code: 'USD', label: 'US Dollar', color: 'text-[#8B5CF6]' },
  { code: 'BDT', label: 'Bangladeshi Taka', color: 'text-[#E2136E]' },
  { code: 'RMB', label: 'Chinese Yuan', color: 'text-[#FF5722]' },
  { code: 'INR', label: 'Indian Rupee', color: 'text-[#FF9800]' },
];

// Light haptic feedback (no-op fallback on unsupported devices)
function haptic() {
  try {
    if ('vibrate' in navigator) navigator.vibrate?.(10);
  } catch { /* noop */ }
}

export default function WalletPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { wallet, subscribeWallet, redeemCode, deposit, withdraw, convert, claimDailyInterest, getDailyInterestAmount, getStakingAPY, getTotalBalanceInGaga, setWalletPin, verifyPin, unlockWallet, lockWallet, hasPinSet, clearWalletPin, pinLocked } = useWalletStore();
  const [activeCurrency, setActiveCurrency] = useState<CurrencyCode>('GAGA');
  const [showPromo, setShowPromo] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promoSuccess, setPromoSuccess] = useState('');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showInterest, setShowInterest] = useState(false);
  const [showSendToFriend, setShowSendToFriend] = useState(false);
  const [showRequestMoney, setShowRequestMoney] = useState(false);
  const [showSplitBill, setShowSplitBill] = useState(false);
  const [convertTab, setConvertTab] = useState<'GAGA_USD' | 'USD_GAGA'>('GAGA_USD');
  const [convertAmount, setConvertAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositCurrency, setDepositCurrency] = useState<CurrencyCode>('USD');
  const [depositMethod, setDepositMethod] = useState('');
  const [withdrawCurrency, setWithdrawCurrency] = useState<CurrencyCode>('GAGA');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('');
  const [withdrawAccount, setWithdrawAccount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [interestClaimed, setInterestClaimed] = useState(0);
  const [interestLoading, setInterestLoading] = useState(false);
  const [pinMode, setPinMode] = useState<'none' | 'verify' | 'set'>('none');
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      if (interestTimerRef.current) clearTimeout(interestTimerRef.current);
    };
  }, []);

  // Subscribe to real-time wallet updates
  useEffect(() => {
    if (!user?.id) return;
    return subscribeWallet(user.id);
  }, [user?.id, subscribeWallet]);

  const coins = wallet?.coins || 0;
  const usdBalance = wallet?.usdBalance || wallet?.usd_balance || 0;
  const apy = getStakingAPY();
  const tier = getStakingTier(coins);
  const dailyInterest = getDailyInterestAmount(user?.id || '');
  const totalGagaValue = getTotalBalanceInGaga();

// Currency display data (balances for fiat currencies default to USD if not separately tracked)
const w = wallet as unknown as Record<string, unknown> | undefined;
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
  const currencies: { code: CurrencyCode; balance: number; label: string; color: string }[] = ALL_CURRENCIES.map((c) => {
    let balance = 0;
    if (c.code === 'GAGA') balance = coins;
    else if (c.code === 'USD') balance = usdBalance || 0;
    else if (c.code === 'BDT') balance = num(w?.bdtBalance ?? w?.bdt_balance);
    else if (c.code === 'RMB') balance = num(w?.rmbBalance ?? w?.rmb_balance);
    else if (c.code === 'INR') balance = num(w?.inrBalance ?? w?.inr_balance);
    return { ...c, balance };
  });

  const handleRedeem = async () => {
    setPromoError(''); setPromoSuccess('');
    if (!user || !promoInput.trim()) { setPromoError('Enter a promo code'); return; }
    const success = await redeemCode(user.id, promoInput, promoCodes);
    if (success) { setPromoSuccess(`${promoCodes[promoInput.toUpperCase()]?.coins || 0} Gaga Coins added!`); setPromoInput(''); }
    else { setPromoError('Invalid or expired promo code'); }
  };

  const handleDeposit = async () => {
    if (!user || !depositAmount || !depositMethod) return;
    setProcessing(true);
    await deposit(user.id, parseFloat(depositAmount), depositCurrency, depositMethod);
    setProcessing(false);
    setShowDeposit(false);
    setDepositAmount('');
    setDepositMethod('');
  };

  const handleWithdraw = async () => {
    if (!user || !withdrawAmount || !withdrawMethod || !withdrawAccount) return;
    setProcessing(true);
    await withdraw(user.id, parseFloat(withdrawAmount), withdrawCurrency, withdrawMethod, withdrawAccount);
    setProcessing(false);
    setShowWithdraw(false);
    setWithdrawAmount('');
    setWithdrawMethod('');
    setWithdrawAccount('');
  };

  const handleConvert = async () => {
    if (!user || !convertAmount) return;
    const [from, to] = convertTab.split('_') as [CurrencyCode, CurrencyCode];
    setProcessing(true);
    const result = await convert(user.id, parseFloat(convertAmount), from, to);
    setProcessing(false);
    if (result) {
      setConvertAmount('');
      setShowConvert(false);
    }
  };

  const handleClaimInterest = async () => {
    if (!user) return;
    setInterestLoading(true);
    const earned = await claimDailyInterest(user.id);
    setInterestClaimed(earned);
    setInterestLoading(false);
    if (earned > 0) {
      if (interestTimerRef.current) clearTimeout(interestTimerRef.current);
      interestTimerRef.current = setTimeout(() => setInterestClaimed(0), 3000);
    }
  };

  const walletId = user ? `GC-${user.id.slice(0, 8).toUpperCase()}` : '';

  // Show PIN lock if needed
  if (pinLocked && pinMode === 'none' && hasPinSet()) {
    return (
      <WalletPinLock
        verifyPin={verifyPin}
        onUnlock={() => { unlockWallet(); setPinMode('none'); }}
        onClose={() => navigate(-1)}
      />
    );
  }

  // Show PIN setup
  if (pinMode === 'set' && user) {
    return (
      <WalletPinLock
        mode="set"
        onUnlock={() => {}}
        onSetPin={async (pin) => { await setWalletPin(user.id, pin); setPinMode('none'); }}
        onClose={() => setPinMode('none')}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5]">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#00C300] to-[#00A300] text-white">
        <div className="flex items-center gap-3 p-4">
          <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-white/20 rounded-full text-white transition-colors" aria-label="Go back">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-bold">My Wallet</h1>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setShowSecurity(true)}
              className="p-2 active:bg-white/20 rounded-full text-white/90 hover:text-white transition-colors"
              aria-label="Security settings"
            >
              <Shield size={20} />
            </button>
            <button type="button" onClick={() => lockWallet()}
              className="p-2 active:bg-white/20 rounded-full text-white/90 hover:text-white transition-colors"
              aria-label="Lock wallet"
            >
              <Lock size={20} />
            </button>
          </div>
        </div>

        {/* Main Balance Card */}
        <div className="px-4 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/10 backdrop-blur-sm rounded-3xl p-5 border border-white/20"
          >
            {/* Currency Tabs */}
            <div className="flex gap-2 mb-4">
{currencies.map(c => (
                <button type="button" key={c.code}
                  onClick={() => { haptic(); setActiveCurrency(c.code); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeCurrency === c.code
                      ? 'bg-white text-[#00C300]'
                      : 'bg-white/20 text-white/80 hover:bg-white/30'
                  }`}
                >
                  {c.code}
                </button>
              ))}
            </div>

            {/* Balance Display */}
            <div className="mb-4">
              <p className="text-white/70 text-xs mb-1">
                {currencies.find(c => c.code === activeCurrency)?.label}
              </p>
              <p className="text-4xl font-bold text-white">
                {activeCurrency === 'GAGA' ? (
                  <>{coins.toLocaleString()} <span className="text-lg font-normal text-white/70">GAGA</span></>
                ) : (
                  <><span className="text-[#8B5CF6]">$</span>{(usdBalance || 0).toFixed(2)}</>
                )}
              </p>
              {activeCurrency === 'GAGA' && (
                <p className="text-white/60 text-xs mt-1">
                  ≈ ${(coins * 0.0071).toFixed(2)} USD
                </p>
              )}
            </div>

            {/* Quick Stats Row */}
            <div className="flex items-center gap-4 text-xs text-white/70">
              <div className="flex items-center gap-1">
                <Percent size={12} />
                <span>{apy}% APY</span>
              </div>
              <div className="flex items-center gap-1">
                <Award size={12} />
                <span>{tier.label} Tier</span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp size={12} />
                <span>+{dailyInterest}/day</span>
              </div>
            </div>

            {/* Wallet ID */}
            <button type="button" onClick={() => {
                navigator.clipboard.writeText(walletId);
                setCopied(true);
                if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
                copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
              }}
              className="mt-3 flex items-center gap-1.5 text-white/60 text-[10px] hover:text-white/80 transition-colors"
            >
              <span>ID: {walletId}</span>
              {copied ? <Check size={10} /> : <Copy size={10} />}
            </button>
          </motion.div>

          {/* Main Action Buttons */}
          <div className="flex gap-2 mt-4">
            {[
              { icon: Plus, label: 'Deposit', color: 'bg-white text-[#00C300]', action: () => setShowDeposit(true) },
              { icon: Minus, label: 'Withdraw', color: 'bg-white/20 text-white', action: () => setShowWithdraw(true) },
              { icon: ArrowRightLeft, label: 'Convert', color: 'bg-white/20 text-white', action: () => setShowConvert(true) },
              { icon: Send, label: 'Send', color: 'bg-white/20 text-white', action: () => setShowSendToFriend(true) },
              { icon: HandCoins, label: 'Request', color: 'bg-white/20 text-white', action: () => setShowRequestMoney(true) },
              { icon: Sparkles, label: 'Earn', color: 'bg-white/20 text-white', action: () => setShowInterest(true) },
            ].map((item) => (
              <button type="button" key={item.label}
                onClick={item.action}
                className={`flex-1 py-2.5 rounded-2xl text-[10px] font-bold transition-all active:scale-95 flex flex-col items-center gap-1 ${item.color}`}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Gaga Coins Value Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white border border-[#EBEBEB] rounded-2xl p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#00C300]/10 flex items-center justify-center">
                <Coins size={16} className="text-[#00C300]" />
              </div>
              <div>
                <p className="text-[#111111] text-sm font-semibold">Gaga Coins Value</p>
                <p className="text-[#8D8D8D] text-[10px]">Your total portfolio value</p>
              </div>
            </div>
            <p className="text-[#00C300] font-bold text-lg">{Math.round(totalGagaValue).toLocaleString()} GAGA</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#F5F5F5] rounded-xl p-2.5 text-center">
              <p className="text-[#00C300] font-bold text-sm">{coins.toLocaleString()}</p>
              <p className="text-[#8D8D8D] text-[10px]">GAGA</p>
            </div>
            <div className="bg-[#F5F5F5] rounded-xl p-2.5 text-center">
              <p className="text-[#8B5CF6] font-bold text-sm">${(usdBalance || 0).toFixed(0)}</p>
              <p className="text-[#8D8D8D] text-[10px]">USD</p>
            </div>
          </div>
        </motion.div>

        {/* Staking Tier Progress */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="bg-white border border-[#EBEBEB] rounded-2xl p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FFD700] to-[#FFA500] flex items-center justify-center">
                <Award size={16} className="text-white" />
              </div>
              <div>
                <p className="text-[#111111] text-sm font-semibold">{tier.label} Tier</p>
                <p className="text-[#8D8D8D] text-[10px]">{apy}% APY staking reward</p>
              </div>
            </div>
            <button type="button" onClick={() => setShowInterest(true)}
              className="text-[#00C300] text-xs font-medium hover:underline"
            >
              Claim +{dailyInterest}
            </button>
          </div>
          {/* Progress bar */}
          <div className="w-full h-2 bg-[#F5F5F5] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((coins / 10000) * 100, 100)}%` }}
              transition={{ duration: 1, delay: 0.3 }}
              className="h-full bg-gradient-to-r from-[#00C300] to-[#FFD700] rounded-full"
            />
          </div>
          <div className="flex justify-between mt-1.5">
            {STAKING_TIERS.filter(t => t.minCoins > 0).map(t => (
              <span key={t.label} className={`text-[9px] ${coins >= t.minCoins ? 'text-[#00C300] font-medium' : 'text-[#C7C7CC]'}`}>
                {t.label}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Quick Actions Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-4 gap-2"
        >
          {[
            { icon: ArrowRightLeft, label: 'Convert', color: 'text-[#00C300]', action: () => setShowConvert(true) },
            { icon: TrendingDown, label: 'Withdraw', color: 'text-[#FF3B30]', action: () => setShowWithdraw(true) },
            { icon: Banknote, label: 'Deposit', color: 'text-[#2196F3]', action: () => setShowDeposit(true) },
            { icon: Send, label: 'Send', color: 'text-[#00C300]', action: () => setShowSendToFriend(true) },
            { icon: HandCoins, label: 'Request', color: 'text-[#FF9800]', action: () => setShowRequestMoney(true) },
            { icon: Split, label: 'Split', color: 'text-[#8B5CF6]', action: () => setShowSplitBill(true) },
            { icon: Gift, label: 'Promo', color: 'text-[#FF9800]', action: () => setShowPromo(true) },
            { icon: Shield, label: 'Security', color: 'text-[#00C300]', action: () => setShowSecurity(true) },
          ].map((item) => (
            <button type="button" key={item.label}
              onClick={item.action}
              className="flex flex-col items-center gap-1.5 p-3 bg-white rounded-xl border border-[#EBEBEB] active:scale-95 transition-transform"
            >
              <item.icon size={20} className={item.color} />
              <span className="text-[#111111] text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
        </motion.div>

        {/* Promo Code Card */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          onClick={() => setShowPromo(true)}
          className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-[#EBEBEB] active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FF9800]/10 flex items-center justify-center">
              <Gift size={18} className="text-[#FF9800]" />
            </div>
            <div>
              <span className="text-[#111111] text-sm font-medium">Redeem Promo Code</span>
              <p className="text-[#8D8D8D] text-[10px]">Get free Gaga Coins</p>
            </div>
          </div>
          <ChevronRight size={20} className="text-[#C7C7CC]" />
        </motion.button>

        {/* Security Card */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          onClick={() => setShowSecurity(true)}
          className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-[#EBEBEB] active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#00C300]/10 flex items-center justify-center">
              {hasPinSet() ? <Lock size={18} className="text-[#00C300]" /> : <Unlock size={18} className="text-[#FF3B30]" />}
            </div>
            <div>
              <span className="text-[#111111] text-sm font-medium">Wallet Security</span>
              <p className="text-[#8D8D8D] text-[10px]">
                {hasPinSet() ? 'PIN protected' : 'Set up PIN protection'}
              </p>
            </div>
          </div>
          <ChevronRight size={20} className="text-[#C7C7CC]" />
        </motion.button>

        {/* Recent Transactions */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
          <h3 className="text-[#8D8D8D] text-sm font-medium mb-3 flex items-center gap-2 px-1">
            <History size={14} /> Recent Transactions
          </h3>
          <div className="space-y-2">
            {(wallet?.transactions || []).slice(0, 10).map((tx) => {
              const isPositive = tx.type === 'earn' || tx.type === 'receive' || tx.type === 'deposit';
              return (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between p-4 bg-white rounded-xl border border-[#EBEBEB] hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isPositive
                        ? 'bg-gradient-to-br from-[#00C300]/20 to-[#00C300]/30' : tx.type === 'convert'
                        ? 'bg-gradient-to-br from-[#2196F3]/20 to-[#2196F3]/30' : 'bg-gradient-to-br from-[#FF3B30]/20 to-[#FF3B30]/30'
                    }`}>
                      {isPositive
                        ? <TrendingUp size={16} className="text-[#00C300]" />
                        : tx.type === 'convert'
                        ? <ArrowRightLeft size={16} className="text-[#2196F3]" />
                        : <TrendingDown size={16} className="text-[#FF3B30]" />
                      }
                    </div>
                    <div>
                      <p className="text-[#111111] text-sm font-medium">{tx.description}</p>
                      <p className="text-[#8D8D8D] text-[10px]">
                        {new Date(tx.timestamp).toLocaleString()} {tx.currency && `· ${tx.currency}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold ${
                      isPositive
                        ? 'text-[#00C300]' : tx.type === 'convert'
                        ? 'text-[#2196F3]' : 'text-[#FF3B30]'
                    }`}>
                      {isPositive ? '+' : '-'}
                      {tx.currency === 'USD' ? '$' : ''}{tx.amount}
                      {!tx.currency && ' GAGA'}
                    </span>
                    {tx.id && (
                      <p className="text-[#C7C7CC] text-[9px] mt-0.5 font-mono">{tx.id.slice(-8).toUpperCase()}</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
            {(!wallet?.transactions || wallet.transactions.length === 0) && (
              <div className="text-center py-10 bg-white rounded-xl border border-dashed border-[#EBEBEB]">
                <History size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm text-[#8D8D8D]">No transactions yet</p>
                <p className="text-xs text-[#C7C7CC] mt-1">Start depositing to see your history</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Promo Dialog */}
      <Dialog open={showPromo} onOpenChange={setShowPromo}>
        <DialogContent className="bg-white border-[#EBEBEB] text-[#111111] sm:max-w-md">
          <DialogHeader><DialogTitle className="text-[#111111] flex items-center gap-2"><Gift size={18} className="text-[#FF9800]" /> Redeem Promo Code</DialogTitle></DialogHeader>
          <div className="pt-4">
            <input
              value={promoInput}
              onChange={e => { setPromoInput(e.target.value); setPromoError(''); setPromoSuccess(''); }}
              placeholder="Enter promo code"
              className="w-full bg-[#F5F5F5] border border-[#EBEBEB] rounded-xl px-4 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] uppercase placeholder:normal-case placeholder:text-[#8D8D8D]"
            />
            {promoError && <p className="text-[#FF3B30] text-xs mt-2">{promoError}</p>}
            {promoSuccess && <p className="text-[#00C300] text-xs mt-2">{promoSuccess}</p>}
            <button type="button" onClick={handleRedeem}
              className="w-full bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl py-3 mt-4 text-sm font-bold transition-colors"
            >
              Redeem
            </button>
            <div className="mt-4 space-y-2">
              <p className="text-[#8D8D8D] text-xs">Available codes:</p>
              {Object.entries(promoCodes).map(([code, data]) => (
                <div key={code} className="flex items-center justify-between bg-[#F5F5F5] rounded-lg px-3 py-2">
                  <span className="text-[#111111] text-xs font-bold">{code}</span>
                  <span className="text-[#00C300] text-xs font-medium">+{data.coins} GAGA</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deposit Dialog */}
      <Dialog open={showDeposit} onOpenChange={setShowDeposit}>
        <DialogContent className="bg-white border-[#EBEBEB] text-[#111111] sm:max-w-md">
          <DialogHeader><DialogTitle className="text-[#111111] flex items-center gap-2"><Banknote size={18} className="text-[#2196F3]" /> Deposit</DialogTitle></DialogHeader>
          <div className="pt-4 space-y-4">
            <div>
              <label className="text-[#8D8D8D] text-xs mb-2 block">Select Currency</label>
              <div className="flex gap-2">
                {(['GAGA', 'USD'] as CurrencyCode[]).map(c => (
                  <button type="button" key={c}
                    onClick={() => setDepositCurrency(c)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                      depositCurrency === c ? 'bg-[#00C300] text-white' : 'bg-[#F5F5F5] text-[#8D8D8D]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[#8D8D8D] text-xs mb-2 block">Select Method</label>
              <div className="grid grid-cols-2 gap-2">
                {depositMethods.filter(m => m.currency === depositCurrency || depositCurrency === 'GAGA').map((method) => (
                  <button type="button" key={method.label}
                    onClick={() => setDepositMethod(method.label)}
                    className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${
                      depositMethod === method.label
                        ? 'border-[#00C300] bg-[#00C300]/5'
                        : 'border-[#EBEBEB] bg-[#F5F5F5]'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full ${method.color} flex items-center justify-center text-white`}>
                      <method.icon size={14} />
                    </div>
                    <span className="text-[#111111] text-xs font-medium">{method.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Amount ({depositCurrency})</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8D8D8D] font-bold">{getCurrencySymbol(depositCurrency)}</span>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#F5F5F5] rounded-xl pl-10 pr-4 py-3 text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                />
              </div>
            </div>
            <button type="button" onClick={handleDeposit}
              disabled={!depositAmount || !depositMethod || processing}
              className="w-full bg-[#2196F3] hover:bg-[#1976D2] text-white rounded-xl py-3 text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {processing ? <Loader size={16} className="animate-spin" /> : 'Deposit'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Withdraw Dialog */}
      <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
        <DialogContent className="bg-white border-[#EBEBEB] text-[#111111] sm:max-w-md">
          <DialogHeader><DialogTitle className="text-[#111111] flex items-center gap-2"><TrendingDown size={18} className="text-[#FF3B30]" /> Withdraw</DialogTitle></DialogHeader>
          <div className="pt-4 space-y-4">
            <div>
              <label className="text-[#8D8D8D] text-xs mb-2 block">Currency</label>
              <div className="flex gap-2">
                {(['GAGA', 'USD'] as CurrencyCode[]).map(c => (
                  <button type="button" key={c}
                    onClick={() => setWithdrawCurrency(c)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                      withdrawCurrency === c ? 'bg-[#00C300] text-white' : 'bg-[#F5F5F5] text-[#8D8D8D]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Amount</label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-3 text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300]"
              />
            </div>
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Method (e.g. PayPal, Bank)</label>
              <input
                value={withdrawMethod}
                onChange={e => setWithdrawMethod(e.target.value)}
                placeholder="Withdrawal method"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-3 text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300]"
              />
            </div>
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Account Number</label>
              <input
                value={withdrawAccount}
                onChange={e => setWithdrawAccount(e.target.value)}
                placeholder="Your account number"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-3 text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300]"
              />
            </div>
            <button type="button" onClick={handleWithdraw}
              disabled={!withdrawAmount || !withdrawMethod || !withdrawAccount || processing}
              className="w-full bg-[#FF3B30] hover:bg-[#D32F2F] text-white rounded-xl py-3 text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {processing ? <Loader size={16} className="animate-spin" /> : 'Withdraw'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert Dialog */}
      <Dialog open={showConvert} onOpenChange={setShowConvert}>
        <DialogContent className="bg-white border-[#EBEBEB] text-[#111111] sm:max-w-md">
          <DialogHeader><DialogTitle className="text-[#111111] flex items-center gap-2"><ArrowRightLeft size={18} className="text-[#00C300]" /> Convert Currency</DialogTitle></DialogHeader>
          <div className="pt-4 space-y-4">
            <div className="flex border-b border-[#EBEBEB] overflow-x-auto">
              {(['GAGA_USD', 'USD_GAGA'] as const).map(pair => (
                <button type="button" key={pair}
                  onClick={() => setConvertTab(pair)}
                  className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                    convertTab === pair ? 'text-[#00C300] border-b-2 border-[#00C300]' : 'text-[#8D8D8D]'
                  }`}
                >
                  {pair.replace('_', ' → ')}
                </button>
              ))}
            </div>

            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Amount</label>
              <input
                type="number"
                value={convertAmount}
                onChange={e => setConvertAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-3 text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300]"
              />
              <p className="text-[#8D8D8D] text-xs mt-1">
                You'll get {formatCurrency(convertCurrency(parseFloat(convertAmount || '0'), convertTab.split('_')[0] as CurrencyCode, convertTab.split('_')[1] as CurrencyCode), convertTab.split('_')[1] as CurrencyCode)}
              </p>
            </div>
            <button type="button" onClick={handleConvert}
              disabled={!convertAmount || processing}
              className="w-full bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl py-3 text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {processing ? <Loader size={16} className="animate-spin" /> : 'Convert'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Interest / Earn Dialog */}
      <Dialog open={showInterest} onOpenChange={setShowInterest}>
        <DialogContent className="bg-white border-[#EBEBEB] text-[#111111] sm:max-w-md">
          <DialogHeader><DialogTitle className="text-[#111111] flex items-center gap-2"><Sparkles size={18} className="text-[#FFD700]" /> Gaga Staking Rewards</DialogTitle></DialogHeader>
          <div className="pt-4 space-y-4">
            {interestClaimed > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#00C300]/10 border border-[#00C300]/30 rounded-xl p-4 text-center"
              >
                <p className="text-[#00C300] font-bold text-lg">+{interestClaimed} GAGA</p>
                <p className="text-[#00C300] text-xs">Claimed successfully!</p>
              </motion.div>
            )}

            <div className="bg-[#F5F5F5] rounded-2xl p-4 text-center">
              <p className="text-[#8D8D8D] text-xs mb-1">Current Balance</p>
              <p className="text-2xl font-bold text-[#111111]">{coins.toLocaleString()} GAGA</p>
              <p className="text-[#00C300] text-sm font-medium mt-1">{apy}% APY — {tier.label} Tier</p>
            </div>

            <div className="bg-gradient-to-r from-[#FFD700]/10 to-[#FFA500]/10 rounded-xl p-4">
              <p className="text-[#111111] text-sm font-medium mb-2">Available to claim</p>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-[#111111]">+{dailyInterest} GAGA</p>
                <button type="button" onClick={handleClaimInterest}
                  disabled={interestLoading || dailyInterest <= 0}
                  className="px-4 py-2 bg-[#00C300] text-white rounded-xl text-sm font-bold disabled:opacity-50 active:bg-[#00A300] transition-colors"
                >
                  {interestLoading ? <Loader size={14} className="animate-spin" /> : 'Claim'}
                </button>
              </div>
              <p className="text-[#8D8D8D] text-[10px] mt-1">Resets every 24 hours</p>
            </div>

            {/* Tier Table */}
            <div className="space-y-2">
              <p className="text-[#111111] text-sm font-medium">Staking Tiers</p>
              {STAKING_TIERS.filter(t => t.minCoins > 0).map(t => (
                <div
                  key={t.label}
                  className={`flex items-center justify-between p-2.5 rounded-lg ${
                    coins >= t.minCoins ? 'bg-[#00C300]/10 border border-[#00C300]/30' : 'bg-[#F5F5F5]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Award size={14} className={coins >= t.minCoins ? 'text-[#00C300]' : 'text-[#C7C7CC]'} />
                    <span className={`text-sm ${coins >= t.minCoins ? 'text-[#00C300] font-medium' : 'text-[#8D8D8D]'}`}>{t.label}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium">{t.apy}%</span>
                    <span className="text-[#8D8D8D] text-[10px] ml-2">{t.minCoins.toLocaleString()}+ GAGA</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Security Dialog */}
      <Dialog open={showSecurity} onOpenChange={setShowSecurity}>
        <DialogContent className="bg-white border-[#EBEBEB] text-[#111111] sm:max-w-md">
          <DialogHeader><DialogTitle className="text-[#111111] flex items-center gap-2"><Shield size={18} className="text-[#00C300]" /> Wallet Security</DialogTitle></DialogHeader>
          <div className="pt-4 space-y-4">
            <div className="bg-[#F5F5F5] rounded-2xl p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-[#00C300]/10 flex items-center justify-center mx-auto mb-2">
                {hasPinSet() ? <Lock size={24} className="text-[#00C300]" /> : <Unlock size={24} className="text-[#FF3B30]" />}
              </div>
              <p className="text-[#111111] font-medium">
                {hasPinSet() ? 'Your wallet is PIN protected' : 'No PIN set — wallet is unsecured'}
              </p>
              <p className="text-[#8D8D8D] text-xs mt-1">
                {hasPinSet() ? 'Enter PIN required to access wallet' : 'Set a 6-digit PIN to secure your funds'}
              </p>
            </div>

            {!hasPinSet() ? (
              <button type="button" onClick={() => { setShowSecurity(false); setPinMode('set'); }}
                className="w-full bg-[#00C300] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#00A300] transition-colors"
              >
                Set Up PIN
              </button>
            ) : (
              <>
                <button type="button" onClick={() => { setShowSecurity(false); setPinMode('set'); }}
                  className="w-full bg-[#F5F5F5] text-[#111111] rounded-xl py-3 text-sm font-bold hover:bg-[#EBEBEB] transition-colors"
                >
                  Change PIN
                </button>
                <button type="button" onClick={() => { clearWalletPin(user?.id || ''); setShowSecurity(false); }}
                  className="w-full text-[#FF3B30] rounded-xl py-3 text-sm font-medium hover:bg-[#FF3B30]/10 transition-colors"
                >
                  Remove PIN Protection
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* New P2P Modals */}
      <SendToFriendModal open={showSendToFriend} onClose={() => setShowSendToFriend(false)} />
      <RequestMoneyModal open={showRequestMoney} onClose={() => setShowRequestMoney(false)} />
      <SplitBillModal open={showSplitBill} onClose={() => setShowSplitBill(false)} />
    </div>
  );
}
