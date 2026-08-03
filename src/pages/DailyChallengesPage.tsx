import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Trophy, Flame, Coins, Zap, Check, MessageCircle, Image, Film, Phone,
  UserPlus, Camera, Heart, Mic, ChevronRight, Star, Crown, Medal, Award
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChallengeStore } from '@/store/useChallengeStore';
import { getLevelProgress } from '@/store/useChallengeStore';
import { getDefaultAvatar } from '@/lib/utils';
import LoadingSkeleton from '@/components/LoadingSkeleton';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  MessageCircle, Image, Film, Phone, UserPlus, Camera, Heart, Mic,
};

const LEVEL_COLORS = ['#8D8D8D', '#00C300', '#2196F3', '#FF9800', '#FF4081', '#9C27B0', '#FFD700'];

const BADGE_ICONS = { Crown, Star, Medal, Award, Flame, Zap };

export default function DailyChallengesPage() {
  const { user } = useAuthStore();
  const { challenges, userStats, loading, streakClaimed, loadDailyChallenges, claimReward, checkInDaily } = useChallengeStore();
  const [activeTab, setActiveTab] = useState<'today' | 'leaderboard' | 'badges'>('today');

  useEffect(() => {
    if (user?.id) {
      loadDailyChallenges(user.id);
    }
  }, [user?.id, loadDailyChallenges]);

  const handleClaim = async (challengeId: string) => {
    if (!user?.id) return;
    await claimReward(user.id, challengeId);
  };

  const handleCheckIn = async () => {
    if (!user?.id) return;
    await checkInDaily(user.id);
  };

  const levelColor = LEVEL_COLORS[Math.min(userStats.level - 1, LEVEL_COLORS.length - 1)] || '#00C300';
  const levelProgress = getLevelProgress(userStats.totalXp);

  const completedCount = challenges.filter(c => c.completed).length;
  const totalRewards = challenges.filter(c => c.claimed).reduce((sum, c) => sum + c.rewardCoins, 0);

  return (
    <div className="h-[100dvh] bg-[#0a0a0a] text-white flex flex-col">
      {/* Header with user stats */}
      <div className="shrink-0 bg-[#1a1a1a] px-5 pt-6 pb-4 rounded-b-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">Daily Challenges</h1>
            <p className="text-[#8D8D8D] text-xs">Complete tasks & earn rewards</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#2a2a2a] px-3 py-1.5 rounded-full">
              <Coins size={14} className="text-[#FFD700]" />
              <span className="text-sm font-bold">{userStats.coinsEarned}</span>
            </div>
          </div>
        </div>

        {/* Level & XP bar */}
        <div className="bg-[#2a2a2a] rounded-xl p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: levelColor }}>
                {userStats.level}
              </div>
              <div>
                <p className="text-sm font-bold">Level {userStats.level}</p>
                <p className="text-[#8D8D8D] text-[10px]">{userStats.totalXp.toLocaleString()} XP total</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[#8D8D8D] text-[10px]">{completedCount}/{challenges.length} completed</p>
              <p className="text-[#FFD700] text-xs font-medium">+{totalRewards} coins today</p>
            </div>
          </div>
          <div className="h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: levelColor }}
              initial={{ width: 0 }}
              animate={{ width: `${levelProgress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Daily check-in */}
        <button
          type="button"
          onClick={handleCheckIn}
          disabled={streakClaimed}
          className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${
            streakClaimed
              ? 'bg-[#00C300]/10 border border-[#00C300]/30'
              : 'bg-[#2a2a2a] hover:bg-[#333]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FF4081]/20 flex items-center justify-center">
              <Flame size={20} className="text-[#FF4081]" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold">Daily Check-in</p>
              <p className="text-[#8D8D8D] text-xs">
                {userStats.dailyStreak > 0 ? `${userStats.dailyStreak} day streak 🔥` : 'Start your streak today!'}
              </p>
            </div>
          </div>
          {streakClaimed ? (
            <Check size={20} className="text-[#00C300]" />
          ) : (
            <div className="text-right">
              <p className="text-[#FFD700] text-xs font-medium">+{userStats.dailyStreak >= 7 ? 100 : userStats.dailyStreak >= 3 ? 50 : 20} coins</p>
              <ChevronRight size={16} className="text-[#8D8D8D] ml-auto" />
            </div>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-[#1a1a1a] px-4">
        {(['today', 'leaderboard', 'badges'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-[#00C300] border-b-2 border-[#00C300]'
                : 'text-[#8D8D8D]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-20">
        {loading ? (
          <LoadingSkeleton count={4} variant="list" />
        ) : activeTab === 'today' ? (
          <div className="py-4 space-y-3">
            {challenges.length === 0 ? (
              <div className="text-center py-8">
                <Trophy size={48} className="text-[#8D8D8D] mx-auto mb-3" />
                <p className="text-[#8D8D8D] text-sm">No challenges available today</p>
                <p className="text-[#8D8D8D] text-xs">Check back tomorrow for new tasks!</p>
              </div>
            ) : (
              challenges.map((challenge, i) => {
                const Icon = ICON_MAP[challenge.icon] || Zap;
                const progressPct = Math.floor((challenge.progress / challenge.target) * 100);

                return (
                  <motion.div
                    key={challenge.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`bg-[#1a1a1a] rounded-xl p-4 ${challenge.completed ? 'border border-[#00C300]/20' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        challenge.completed ? 'bg-[#00C300]/20' : 'bg-[#2a2a2a]'
                      }`}>
                        <Icon size={20} className={challenge.completed ? 'text-[#00C300]' : 'text-[#8D8D8D]'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold">{challenge.title}</p>
                          {challenge.completed && challenge.claimed && (
                            <Check size={16} className="text-[#00C300]" />
                          )}
                        </div>
                        <p className="text-[#8D8D8D] text-xs mb-2">{challenge.description}</p>

                        {/* Progress bar */}
                        <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden mb-2">
                          <div
                            className={`h-full rounded-full ${challenge.completed ? 'bg-[#00C300]' : 'bg-[#8D8D8D]'}`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[#8D8D8D] text-[10px]">{challenge.progress}/{challenge.target}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[#FFD700] text-[10px] flex items-center gap-0.5">
                              <Coins size={10} /> {challenge.rewardCoins}
                            </span>
                            <span className="text-[#2196F3] text-[10px] flex items-center gap-0.5">
                              <Zap size={10} /> {challenge.rewardXp} XP
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Claim button */}
                      {challenge.completed && !challenge.claimed && (
                        <button
                          type="button"
                          onClick={() => handleClaim(challenge.id)}
                          className="shrink-0 px-3 py-1.5 bg-[#00C300] text-black rounded-full text-xs font-bold"
                        >
                          Claim
                        </button>
                      )}
                      {challenge.claimed && (
                        <span className="shrink-0 text-[#00C300] text-xs font-medium">Claimed</span>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        ) : activeTab === 'leaderboard' ? (
          <div className="py-4 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold">Top GaGa Users</h2>
              <span className="text-[#8D8D8D] text-xs">This Week</span>
            </div>
            {/* Mock leaderboard */}
            {[
              { rank: 1, name: 'Alex Chen', xp: 12500, level: 12, streak: 15, avatar: '' },
              { rank: 2, name: 'Sarah Kim', xp: 11200, level: 11, streak: 12, avatar: '' },
              { rank: 3, name: 'Mike Johnson', xp: 9800, level: 10, streak: 8, avatar: '' },
              { rank: 4, name: user?.name || 'You', xp: userStats.totalXp, level: userStats.level, streak: userStats.dailyStreak, avatar: user?.avatar || '', isMe: true },
              { rank: 5, name: 'Emma Wilson', xp: 7200, level: 8, streak: 6, avatar: '' },
            ].map((entry) => (
              <div
                key={entry.rank}
                className={`flex items-center gap-3 p-3 rounded-xl ${entry.isMe ? 'bg-[#00C300]/10 border border-[#00C300]/30' : 'bg-[#1a1a1a]'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  entry.rank === 1 ? 'bg-[#FFD700] text-black' :
                  entry.rank === 2 ? 'bg-[#C0C0C0] text-black' :
                  entry.rank === 3 ? 'bg-[#CD7F32] text-black' :
                  'bg-[#2a2a2a] text-[#8D8D8D]'
                }`}>
                  {entry.rank}
                </div>
                <img src={entry.avatar || getDefaultAvatar(entry.name)} alt="User" className="w-9 h-9 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.name}</p>
                  <p className="text-[#8D8D8D] text-[10px]">Level {entry.level} • {entry.xp.toLocaleString()} XP</p>
                </div>
                <div className="text-right">
                  <p className="text-[#FF4081] text-xs font-bold flex items-center gap-1">
                    <Flame size={12} /> {entry.streak}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { name: 'First Steps', desc: 'Complete 1 challenge', icon: 'Star', color: '#8D8D8D', unlocked: true },
                { name: 'Socialite', desc: 'Add 10 friends', icon: 'UserPlus', color: '#2196F3', unlocked: true },
                { name: 'Content King', desc: 'Post 50 times', icon: 'Image', color: '#FF9800', unlocked: false },
                { name: 'Streak Master', desc: '7-day streak', icon: 'Flame', color: '#FF4081', unlocked: userStats.dailyStreak >= 7 },
                { name: 'Level 10', desc: 'Reach level 10', icon: 'Crown', color: '#FFD700', unlocked: userStats.level >= 10 },
                { name: 'Voice Star', desc: 'Host 5 voice rooms', icon: 'Mic', color: '#9C27B0', unlocked: false },
              ].map((badge) => {
                const BadgeIcon = BADGE_ICONS[badge.icon as keyof typeof BADGE_ICONS] || Star;
                return (
                  <div
                    key={badge.name}
                    className={`bg-[#1a1a1a] rounded-xl p-3 text-center ${
                      badge.unlocked ? '' : 'opacity-40'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ backgroundColor: badge.unlocked ? `${badge.color}20` : '#2a2a2a' }}>
                      <BadgeIcon size={24} style={{ color: badge.unlocked ? badge.color : '#8D8D8D' }} />
                    </div>
                    <p className="text-xs font-medium">{badge.name}</p>
                    <p className="text-[10px] text-[#8D8D8D]">{badge.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
