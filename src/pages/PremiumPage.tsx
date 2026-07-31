import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Check, Sparkles, Crown, Zap, Star,
  Copy, Share2, Gift, Clock, Shield, Palette, BarChart3,
  Headphones, Megaphone, Globe, ArrowRight, Loader, Coins,
  DollarSign
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import {
  usePremiumStore,
  PREMIUM_PLANS,
  PLAN_PRICING_USD,
  PLAN_PRICING_COINS,
  REFERRAL_REWARD_COINS,
} from '@/store/usePremiumStore';
import { toast } from 'sonner';

const currencySymbols: Record<string, string> = {
  USD: '$',
  coins: 'G',
};

export default function PremiumPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    currentTier,
    subscription,
    referralCode,
    referralCount,
    subscribeToPremium,
    upgradePlan,
    generateReferralCode,
    getReferralStats,
    getDaysRemaining,
  } = usePremiumStore();

  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'coins'>('USD');
  const [activePlan, setActivePlan] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [referralInput, setReferralInput] = useState('');
  const [applyingReferral, setApplyingReferral] = useState(false);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToPremium(user.id);
    return () => { unsub(); };
  }, [user?.id, subscribeToPremium]);

  useEffect(() => {
    if (user?.id) {
      getReferralStats(user.id);
    }
  }, [user?.id, getReferralStats]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const effectiveCode = referralCode || (user ? generateReferralCode(user.id) : '');

  const handleUpgrade = async (planId: string) => {
    if (!user) {
      toast.error('Please login first');
      navigate('/auth');
      return;
    }
    if (planId === 'free') return;
    setActivePlan(planId);
    setUpgrading(true);
    const success = await upgradePlan(user.id, planId, selectedCurrency);
    setUpgrading(false);
    if (!success) setActivePlan(null);
  };

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(effectiveCode).then(() => {
      setCopied(true);
      toast.success('Referral code copied!');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShareReferral = async () => {
    const shareData = {
      title: 'Join GaGa Chat',
      text: `Use my referral code ${effectiveCode} to join GaGa Chat and earn ${REFERRAL_REWARD_COINS} coins!`,
      url: window.location.origin,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        handleCopyReferral();
      }
    } catch {
      // ignore
    }
  };

  const handleApplyReferral = async () => {
    if (!user || !referralInput.trim()) return;
    setApplyingReferral(true);
    const { usePremiumStore: store } = await import('@/store/usePremiumStore');
    const success = await store.getState().applyReferralCode(user.id, referralInput.trim(), user.name);
    setApplyingReferral(false);
    if (success) {
      setReferralInput('');
      setShowReferral(false);
    }
  };

  const daysRemaining = getDaysRemaining();
  const isSubscribed = currentTier !== 'free';

  const getPrice = (planId: string) => {
    if (planId === 'free') return 0;
    if (selectedCurrency === 'USD') return PLAN_PRICING_USD[planId];
    if (selectedCurrency === 'coins') return PLAN_PRICING_COINS[planId];
    return PREMIUM_PLANS.find(p => p.id === planId)?.price || 0;
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, damping: 20, stiffness: 100 } },
  };

  const tierIcons: Record<string, React.ReactNode> = {
    free: <Star size={20} />,
    premium: <Sparkles size={20} />,
    vip: <Crown size={20} />,
    creator: <Zap size={20} />,
  };

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-[#EBEBEB]">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <button type="button" onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-[#F5F5F5] rounded-full transition-colors"
          >
            <ArrowLeft size={22} className="text-[#111111]" />
          </button>
          <h1 className="text-lg font-bold text-[#111111]">GaGa Premium</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {/* Current Status Hero */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[#00C300] to-[#00A300] rounded-2xl p-6 text-white relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-white/20 rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-wide">
                {currentTier}
              </div>
              {isSubscribed && daysRemaining > 0 && (
                <div className="bg-white/20 rounded-lg px-2 py-1 text-xs font-medium flex items-center gap-1">
                  <Clock size={12} /> {daysRemaining} days left
                </div>
              )}
            </div>
            <h2 className="text-2xl font-bold mb-1">
              {isSubscribed ? 'You\'re Premium!' : 'Unlock GaGa Premium'}
            </h2>
            <p className="text-white/90 text-sm max-w-xs">
              {isSubscribed
                ? `Enjoy your ${currentTier} benefits. Your subscription renews automatically.`
                : 'Get verified, go ad-free, and unlock exclusive features for creators and power users.'}
            </p>
            {isSubscribed && subscription && (
              <div className="mt-3 text-xs text-white/70">
                Expires: {new Date(subscription.expiresAt).toLocaleDateString()}
              </div>
            )}
          </div>
        </motion.div>

        {/* Currency Selector */}
        <div className="flex justify-center gap-2">
          {([
            { code: 'USD' as const, icon: DollarSign, label: 'USD' },
            { code: 'coins' as const, icon: Coins, label: 'Coins' },
          ]).map((c) => (
            <button type="button" key={c.code}
              onClick={() => setSelectedCurrency(c.code)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedCurrency === c.code
                  ? 'bg-[#111111] text-white shadow-md'
                  : 'bg-white text-[#8D8D8D] hover:text-[#111111]'
              }`}
            >
              <c.icon size={14} /> {c.label}
            </button>
          ))}
        </div>

        {/* Plans */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          {PREMIUM_PLANS.map((plan) => {
            const isCurrent = currentTier === plan.id;
            const price = getPrice(plan.id);
            const isPopular = plan.popular;
            const isUpgradingThis = activePlan === plan.id && upgrading;

            return (
              <motion.div
                key={plan.id}
                variants={cardVariants}
                whileHover={{ y: -4, scale: 1.01 }}
                className={`relative bg-white rounded-2xl border-2 p-5 transition-colors ${
                  isCurrent
                    ? 'border-[#00C300]'
                    : isPopular
                    ? 'border-[#00C300]/50'
                    : 'border-transparent'
                } ${isPopular ? 'shadow-lg shadow-[#00C300]/10' : 'shadow-sm'}`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#00C300] text-white text-xs font-bold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 right-4 bg-[#111111] text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <Check size={12} /> Active
                  </div>
                )}

                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                    style={{ backgroundColor: plan.color }}
                  >
                    {tierIcons[plan.id]}
                  </div>
                  <div>
                    <h3 className="font-bold text-[#111111]">{plan.name}</h3>
                    <p className="text-xs text-[#8D8D8D]">{plan.description}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <span className="text-3xl font-bold text-[#111111]">
                    {price === 0 ? 'Free' : `${currencySymbols[selectedCurrency]}${price}`}
                  </span>
                  {price > 0 && (
                    <span className="text-[#8D8D8D] text-sm ml-1">/month</span>
                  )}
                </div>

                <ul className="space-y-2 mb-5">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-[#111111]">
                      <Check size={14} className="text-[#00C300] mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button type="button" onClick={() => handleUpgrade(plan.id)}
                  disabled={isCurrent || (upgrading && activePlan === plan.id) || (upgrading && !isUpgradingThis)}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                    isCurrent
                      ? 'bg-[#F5F5F5] text-[#8D8D8D] cursor-default'
                      : isPopular
                      ? 'bg-[#00C300] hover:bg-[#00A300] text-white active:scale-95'
                      : 'bg-[#111111] hover:bg-[#333333] text-white active:scale-95'
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {isUpgradingThis ? (
                    <Loader size={16} className="animate-spin" />
                  ) : isCurrent ? (
                    'Current Plan'
                  ) : (
                    <>
                      Upgrade <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Feature Highlights */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-[#111111] mb-4">Why Go Premium?</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { icon: Shield, title: 'Verified Badge', desc: 'Get the blue checkmark' },
              { icon: Megaphone, title: 'Ad-Free', desc: 'No ads in your feed' },
              { icon: Clock, title: 'Scheduled Posts', desc: 'Plan content ahead' },
              { icon: BarChart3, title: 'Analytics', desc: 'Track your growth' },
              { icon: Headphones, title: 'Priority Support', desc: 'Faster responses' },
              { icon: Palette, title: 'Custom Themes', desc: 'Personalize your app' },
            ].map((item) => (
              <div key={item.title} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F5F5F5] flex items-center justify-center shrink-0">
                  <item.icon size={18} className="text-[#00C300]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#111111]">{item.title}</p>
                  <p className="text-xs text-[#8D8D8D]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Referral Section */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Gift size={18} className="text-[#00C300]" />
            <h3 className="font-bold text-[#111111]">Refer & Earn</h3>
          </div>
          <p className="text-sm text-[#8D8D8D] mb-4">
            Share your code with friends. You both earn {REFERRAL_REWARD_COINS} coins when they sign up!
          </p>

          <div className="bg-[#F5F5F5] rounded-xl p-4 flex items-center gap-3 mb-4">
            <div className="flex-1">
              <p className="text-xs text-[#8D8D8D] mb-1">Your Referral Code</p>
              <p className="text-lg font-bold text-[#111111] tracking-wider font-mono">
                {effectiveCode}
              </p>
            </div>
            <button type="button" onClick={handleCopyReferral}
              className="p-2.5 bg-white rounded-xl hover:bg-[#00C300]/10 transition-colors border border-[#EBEBEB]"
              title="Copy code"
            >
              <Copy size={18} className={copied ? 'text-[#00C300]' : 'text-[#8D8D8D]'} />
            </button>
            <button type="button" onClick={handleShareReferral}
              className="p-2.5 bg-[#00C300] rounded-xl hover:bg-[#00A300] transition-colors"
              title="Share"
            >
              <Share2 size={18} className="text-white" />
            </button>
          </div>

          <div className="flex items-center justify-between text-sm mb-4">
            <div className="flex items-center gap-1 text-[#8D8D8D]">
              <UsersIcon count={referralCount} />
              <span>{referralCount} friend{referralCount !== 1 ? 's' : ''} joined</span>
            </div>
            <div className="flex items-center gap-1 text-[#00C300] font-medium">
              <Coins size={14} />
              <span>{referralCount * REFERRAL_REWARD_COINS} coins earned</span>
            </div>
          </div>

          <button type="button" onClick={() => setShowReferral(!showReferral)}
            className="w-full py-2.5 rounded-xl border border-[#EBEBEB] text-sm font-medium text-[#111111] hover:bg-[#F5F5F5] transition-colors"
          >
            {showReferral ? 'Close' : 'Have a referral code?'}
          </button>

          <AnimatePresence>
            {showReferral && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-4 space-y-3">
                  <div className="flex gap-2">
                    <input
                      value={referralInput}
                      onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                      placeholder="Enter referral code (e.g. GAGA-ABC123)"
                      className="flex-1 bg-[#F5F5F5] rounded-xl px-4 py-3 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#C7C7CC]"
                    />
                    <button type="button" onClick={handleApplyReferral}
                      disabled={applyingReferral || !referralInput.trim()}
                      className="bg-[#00C300] hover:bg-[#00A300] text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                    >
                      {applyingReferral ? <Loader size={14} className="animate-spin" /> : 'Apply'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* FAQ / Trust */}
        <div className="text-center space-y-2 pb-4">
          <div className="flex items-center justify-center gap-1 text-xs text-[#8D8D8D]">
            <Shield size={12} />
            <span>Secure payment via Visa, Mastercard, PayPal, or Gaga Coins</span>
          </div>
          <div className="flex items-center justify-center gap-1 text-xs text-[#8D8D8D]">
            <Globe size={12} />
            <span>Prices shown in {selectedCurrency.toUpperCase()}. Cancel anytime.</span>
          </div>
        </div>
      </div>

      {/* Upgrade Loading Overlay */}
      <AnimatePresence>
        {upgrading && activePlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-white rounded-2xl p-6 mx-4 max-w-xs w-full text-center"
            >
              <Loader size={32} className="animate-spin text-[#00C300] mx-auto mb-3" />
              <h3 className="font-bold text-[#111111]">Upgrading to {PREMIUM_PLANS.find(p => p.id === activePlan)?.name}</h3>
              <p className="text-sm text-[#8D8D8D] mt-1">Please wait...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UsersIcon({ count }: { count: number }) {
  return (
    <div className="flex -space-x-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`w-4 h-4 rounded-full border border-white ${
            i < count ? 'bg-[#00C300]' : 'bg-[#C7C7CC]'
          }`}
        />
      ))}
    </div>
  );
}
