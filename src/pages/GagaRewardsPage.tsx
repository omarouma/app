import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Coins, Gift, Flame, Target, Users, Check,
  Sparkles, Zap, Star, Trophy, TrendingUp
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useWalletStore, STAKING_TIERS } from '@/store/useWalletStore';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface Mission {
  id: string;
  title: string;
  description: string;
  reward: number;
  icon: typeof Coins;
  color: string;
  completed: boolean;
  progress: number;
  maxProgress: number;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function GagaRewardsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { wallet, earnCoins, claimDailyInterest, getDailyInterestAmount, subscribeWallet } = useWalletStore();
  const [activeTab, setActiveTab] = useState<'checkin' | 'missions' | 'refer'>('checkin');

  useEffect(() => {
    if (!user?.id) return;
    return subscribeWallet(user.id);
  }, [user?.id, subscribeWallet]);
  const [showClaimed, setShowClaimed] = useState(false);
  const [claimedAmount, setClaimedAmount] = useState(0);
  const [interestLoading, setInterestLoading] = useState(false);
  const [referralCode] = useState(() => {
    return user ? `GAGA-${user.id.slice(0, 6).toUpperCase()}` : '';
  });
  const [copiedRef, setCopiedRef] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const coins = wallet?.coins || 0;
  const dailyInterest = getDailyInterestAmount(user?.id || '');

  // Check-in streak data (simulated - would come from backend)
  const today = new Date().getDay(); // 0 = Sunday
  const adjustedToday = today === 0 ? 6 : today - 1; // Convert to 0=Monday
  const [checkInDays, setCheckInDays] = useState<boolean[]>(() => {
    const days = Array(7).fill(false);
    // Mark previous days as checked in for demo
    for (let i = 0; i < adjustedToday; i++) days[i] = true;
    return days;
  });

  const checkInRewards = [5, 5, 10, 5, 5, 15, 25];

  const handleCheckIn = async (dayIndex: number) => {
    if (!user || checkInDays[dayIndex]) return;
    const reward = checkInRewards[dayIndex];
    await earnCoins(user.id, reward, `Day ${dayIndex + 1} check-in reward`);
    setCheckInDays(prev => {
      const next = [...prev];
      next[dayIndex] = true;
      return next;
    });
    setClaimedAmount(reward);
    setShowClaimed(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShowClaimed(false), 2000);
  };

  const handleClaimStaking = async () => {
    if (!user) return;
    setInterestLoading(true);
    const earned = await claimDailyInterest(user.id);
    setInterestLoading(false);
    if (earned > 0) {
      setClaimedAmount(earned);
      setShowClaimed(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setShowClaimed(false), 3000);
    }
  };

  const [missions, setMissions] = useState<Mission[]>([
    { id: '1', title: 'Send a Message', description: 'Send 5 messages to friends', reward: 5, icon: Zap, color: 'text-[#00C300]', completed: false, progress: 3, maxProgress: 5 },
    { id: '2', title: 'Make a Voice Call', description: 'Complete 1 voice call', reward: 10, icon: Users, color: 'text-[#2196F3]', completed: false, progress: 0, maxProgress: 1 },
    { id: '3', title: 'Post on Timeline', description: 'Create 1 timeline post', reward: 15, icon: Star, color: 'text-[#FF9800]', completed: false, progress: 0, maxProgress: 1 },
    { id: '4', title: 'Refer a Friend', description: 'Invite 1 friend to GaGa Chat', reward: 50, icon: Users, color: 'text-[#8B5CF6]', completed: false, progress: 0, maxProgress: 1 },
    { id: '5', title: 'Daily Login Streak', description: 'Login for 3 days in a row', reward: 20, icon: Flame, color: 'text-[#FF3B30]', completed: false, progress: 2, maxProgress: 3 },
    { id: '6', title: 'Save 100 Gaga Coins', description: 'Keep a balance of 100+ GAGA', reward: 25, icon: TrendingUp, color: 'text-[#00C300]', completed: coins >= 100, progress: Math.min(coins, 100), maxProgress: 100 },
  ]);

  const handleClaimMission = async (mission: Mission) => {
    if (!user || mission.completed) return;
    await earnCoins(user.id, mission.reward, `Mission reward: ${mission.title}`);
    setMissions(prev => prev.map(m => m.id === mission.id ? { ...m, completed: true } : m));
    setClaimedAmount(mission.reward);
    setShowClaimed(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShowClaimed(false), 2000);
  };

  const completedCount = missions.filter(m => m.completed).length;

  const stakingAPY = useWalletStore((s) => s.getStakingAPY());

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5]">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#00C300] to-[#00A300] text-white">
        <div className="flex items-center gap-3 p-4">
          <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-white/20 rounded-full text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-bold">Gaga Rewards</h1>
          <div className="ml-auto flex items-center gap-1 bg-white/20 rounded-full px-3 py-1">
            <Coins size={14} />
            <span className="text-sm font-bold">{coins.toLocaleString()}</span>
          </div>
        </div>

        <div className="px-4 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/10 backdrop-blur-sm rounded-3xl p-5 border border-white/20"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-white/70 text-xs">Total Earnings</p>
                <p className="text-2xl font-bold">{coins.toLocaleString()} <span className="text-sm font-normal text-white/70">GAGA</span></p>
              </div>
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FFD700] to-[#FFA500] flex items-center justify-center">
                <Trophy size={28} className="text-white" />
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-white/70">
              <span className="flex items-center gap-1"><Target size={12} /> {completedCount}/{missions.length} missions</span>
              <span className="flex items-center gap-1"><Flame size={12} /> {checkInDays.filter(Boolean).length} day streak</span>
              <span className="flex items-center gap-1"><TrendingUp size={12} /> {stakingAPY}% APY</span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Staking Banner */}
      {dailyInterest > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 -mt-3 bg-white rounded-2xl p-4 shadow-sm border border-[#EBEBEB] relative z-10"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFD700] to-[#FFA500] flex items-center justify-center">
                <Sparkles size={18} className="text-white" />
              </div>
              <div>
                <p className="text-[#111111] text-sm font-medium">Daily Staking Reward</p>
                <p className="text-[#00C300] text-lg font-bold">+{dailyInterest} GAGA</p>
              </div>
            </div>
            <button type="button" onClick={handleClaimStaking}
              disabled={interestLoading}
              className="px-4 py-2 bg-[#00C300] text-white rounded-xl text-sm font-bold active:bg-[#00A300] transition-colors disabled:opacity-50"
            >
              {interestLoading ? '...' : 'Claim'}
            </button>
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[#EBEBEB] px-4 mt-4 bg-white">
        {(['checkin', 'missions', 'refer'] as const).map(tab => (
          <button type="button" key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium transition-colors capitalize ${
              activeTab === tab ? 'text-[#00C300] border-b-2 border-[#00C300]' : 'text-[#8D8D8D]'
            }`}
          >
            {tab === 'checkin' ? 'Daily Check-in' : tab === 'missions' ? 'Missions' : 'Refer Friends'}
          </button>
        ))}
      </div>

      <div className="p-4 pb-20">
        {/* Daily Check-in */}
        {activeTab === 'checkin' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="bg-white rounded-2xl p-4 border border-[#EBEBEB] mb-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-[#111111] font-bold">7-Day Streak</h3>
                  <p className="text-[#8D8D8D] text-xs">Check in daily for bigger rewards</p>
                </div>
                <div className="flex items-center gap-1 bg-[#FF9800]/10 px-3 py-1 rounded-full">
                  <Flame size={14} className="text-[#FF9800]" />
                  <span className="text-[#FF9800] text-xs font-bold">{checkInDays.filter(Boolean).length}/7</span>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {DAYS.map((day, i) => {
                  const isToday = i === adjustedToday;
                  const checked = checkInDays[i];
                  return (
                    <button type="button" key={day}
                      onClick={() => isToday && handleCheckIn(i)}
                      disabled={!isToday || checked}
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl transition-all ${
                        checked
                          ? 'bg-[#00C300]/10 border border-[#00C300]/30'
                          : isToday
                          ? 'bg-[#00C300] text-white active:scale-95'
                          : 'bg-[#F5F5F5] text-[#8D8D8D]'
                      }`}
                    >
                      <span className="text-[10px] font-medium">{day}</span>
                      {checked ? (
                        <Check size={16} className="text-[#00C300]" />
                      ) : (
                        <span className="text-xs font-bold">+{checkInRewards[i]}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-center text-[#8D8D8D] text-xs mt-3">
                {checkInDays[adjustedToday] ? 'Come back tomorrow for +5 GAGA!' : 'Tap today to claim your reward!'}
              </p>
            </div>

            {/* Staking Info */}
            <div className="bg-white rounded-2xl p-4 border border-[#EBEBEB]">
              <h3 className="text-[#111111] font-bold mb-3 flex items-center gap-2">
                <TrendingUp size={16} className="text-[#00C300]" /> Staking Tiers
              </h3>
              <div className="space-y-2">
                {STAKING_TIERS.filter(t => t.minCoins > 0).map(t => (
                  <div
                    key={t.label}
                    className={`flex items-center justify-between p-3 rounded-xl ${
                      coins >= t.minCoins ? 'bg-[#00C300]/5 border border-[#00C300]/20' : 'bg-[#F5F5F5]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Trophy size={14} className={coins >= t.minCoins ? 'text-[#FFD700]' : 'text-[#C7C7CC]'} />
                      <span className={`text-sm ${coins >= t.minCoins ? 'text-[#00C300] font-medium' : 'text-[#8D8D8D]'}`}>
                        {t.label}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">{t.apy}% APY</span>
                      <p className="text-[#8D8D8D] text-[10px]">{t.minCoins.toLocaleString()}+ GAGA</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Missions */}
        {activeTab === 'missions' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            {missions.map((mission, i) => (
              <motion.div
                key={mission.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`bg-white rounded-2xl p-4 border ${
                  mission.completed ? 'border-[#00C300]/30 opacity-60' : 'border-[#EBEBEB]'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center ${mission.completed ? 'bg-[#00C300]/10' : ''}`}>
                      {mission.completed ? (
                        <Check size={18} className="text-[#00C300]" />
                      ) : (
                        <mission.icon size={18} className={mission.color} />
                      )}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${mission.completed ? 'text-[#8D8D8D] line-through' : 'text-[#111111]'}`}>
                        {mission.title}
                      </p>
                      <p className="text-[#8D8D8D] text-[11px]">{mission.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[#00C300] font-bold text-sm">+{mission.reward}</span>
                    <p className="text-[#8D8D8D] text-[10px]">GAGA</p>
                  </div>
                </div>
                {!mission.completed && (
                  <div className="ml-13 pl-[52px]">
                    <div className="w-full h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#00C300] rounded-full transition-all"
                        style={{ width: `${(mission.progress / mission.maxProgress) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[#8D8D8D] text-[10px]">{mission.progress}/{mission.maxProgress}</span>
                      {mission.progress >= mission.maxProgress && (
                        <button type="button" onClick={() => handleClaimMission(mission)}
                          className="px-3 py-1 bg-[#00C300] text-white text-[10px] rounded-full font-medium active:bg-[#00A300]"
                        >
                          Claim
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Refer Friends */}
        {activeTab === 'refer' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="bg-white rounded-2xl p-6 border border-[#EBEBEB] text-center mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center mx-auto mb-3">
                <Gift size={32} className="text-white" />
              </div>
              <h3 className="text-[#111111] font-bold text-lg mb-1">Invite & Earn</h3>
              <p className="text-[#8D8D8D] text-sm mb-4">Share your referral code with friends and earn 50 GAGA for each signup!</p>
              <div className="bg-[#F5F5F5] rounded-xl p-4 flex items-center justify-between mb-4">
                <span className="text-[#111111] font-mono font-bold">{referralCode}</span>
                <button type="button" onClick={() => {
                    navigator.clipboard.writeText(referralCode);
                    setCopiedRef(true);
                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                    timeoutRef.current = setTimeout(() => setCopiedRef(false), 2000);
                  }}
                  className="text-[#00C300] text-sm font-medium"
                >
                  {copiedRef ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <button type="button" onClick={async () => {
                  try {
                    await navigator.share({
                      title: 'Join me on GaGa Chat!',
                      text: `Use my referral code ${referralCode} and get 50 free Gaga Coins!`,
                      url: window.location.origin,
                    });
                  } catch { /* cancelled */ }
                }}
                className="w-full py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold active:bg-[#00A300] transition-colors"
              >
                Share with Friends
              </button>
            </div>

            {/* How it works */}
            <div className="bg-white rounded-2xl p-4 border border-[#EBEBEB]">
              <h3 className="text-[#111111] font-bold text-sm mb-3">How it works</h3>
              {[
                { step: '1', text: 'Share your unique referral code' },
                { step: '2', text: 'Friend signs up using your code' },
                { step: '3', text: 'Both get 50 GAGA bonus!' },
              ].map(item => (
                <div key={item.step} className="flex items-center gap-3 py-2.5">
                  <div className="w-6 h-6 rounded-full bg-[#00C300] text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {item.step}
                  </div>
                  <p className="text-[#111111] text-sm">{item.text}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Claimed Toast */}
      <Dialog open={showClaimed} onOpenChange={setShowClaimed}>
        <DialogContent className="bg-white border-[#00C300] text-[#111111] sm:max-w-sm text-center p-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-16 h-16 rounded-full bg-[#00C300]/10 flex items-center justify-center mx-auto mb-3"
          >
            <Coins size={32} className="text-[#00C300]" />
          </motion.div>
          <p className="text-2xl font-bold text-[#00C300]">+{claimedAmount} GAGA</p>
          <p className="text-[#8D8D8D] text-sm">Claimed successfully!</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
