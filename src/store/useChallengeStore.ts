/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { toast } from 'sonner';
import { isFirestoreAvailable, COLLECTIONS, getDocById, updateDocById } from '@/lib/firestore';

export interface Challenge {
  id: string;
  type: 'post' | 'chat' | 'call' | 'friend' | 'reel' | 'story' | 'voice_room' | 'react' | 'streak';
  title: string;
  description: string;
  icon: string;
  rewardCoins: number;
  rewardXp: number;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  expiresAt: Date;
  createdAt: Date;
}

export interface UserStats {
  totalXp: number;
  level: number;
  dailyStreak: number;
  lastCheckIn: Date | null;
  coinsEarned: number;
  challengesCompleted: number;
  badges: string[];
}

interface ChallengeStore {
  challenges: Challenge[];
  userStats: UserStats;
  loading: boolean;
  streakClaimed: boolean;
  loadDailyChallenges: (userId: string) => Promise<void>;
  updateProgress: (userId: string, type: Challenge['type'], amount?: number) => Promise<void>;
  claimReward: (userId: string, challengeId: string) => Promise<void>;
  checkInDaily: (userId: string) => Promise<void>;
  getLeaderboard: (limit?: number) => Promise<Array<{ userId: string; name: string; avatar: string; xp: number; level: number; streak: number }>>;
}

const CHALLENGE_TYPES: Array<{
  type: Challenge['type'];
  title: string;
  description: string;
  icon: string;
  rewardCoins: number;
  rewardXp: number;
  target: number;
}> = [
  { type: 'chat', title: 'Social Butterfly', description: 'Send 10 messages today', icon: 'MessageCircle', rewardCoins: 50, rewardXp: 100, target: 10 },
  { type: 'post', title: 'Content Creator', description: 'Share 1 post on the timeline', icon: 'Image', rewardCoins: 75, rewardXp: 150, target: 1 },
  { type: 'reel', title: 'Reel Star', description: 'Watch 5 reels', icon: 'Film', rewardCoins: 40, rewardXp: 80, target: 5 },
  { type: 'call', title: 'Voice Connect', description: 'Make a voice or video call', icon: 'Phone', rewardCoins: 60, rewardXp: 120, target: 1 },
  { type: 'friend', title: 'Network Builder', description: 'Add 1 new friend', icon: 'UserPlus', rewardCoins: 80, rewardXp: 160, target: 1 },
  { type: 'story', title: 'Storyteller', description: 'Add a story', icon: 'Camera', rewardCoins: 50, rewardXp: 100, target: 1 },
  { type: 'react', title: 'Engager', description: 'React to 10 posts or reels', icon: 'Heart', rewardCoins: 30, rewardXp: 60, target: 10 },
  { type: 'voice_room', title: 'Talk Show', description: 'Join a voice room for 5 minutes', icon: 'Mic', rewardCoins: 70, rewardXp: 140, target: 1 },
];

function getLevelFromXp(xp: number): number {
  let level = 1;
  let required = 100;
  while (xp >= required) {
    xp -= required;
    level++;
    required = Math.floor(required * 1.2);
  }
  return level;
}

function getLevelProgress(xp: number): number {
  let required = 100;
  let accumulated = 0;
  while (xp >= accumulated + required) {
    accumulated += required;
    required = Math.floor(required * 1.2);
  }
  const currentLevelXp = xp - accumulated;
  return Math.min(100, Math.floor((currentLevelXp / required) * 100));
}

export const useChallengeStore = create<ChallengeStore>((set, get) => ({
  challenges: [],
  userStats: {
    totalXp: 0,
    level: 1,
    dailyStreak: 0,
    lastCheckIn: null,
    coinsEarned: 0,
    challengesCompleted: 0,
    badges: [],
  },
  loading: false,
  streakClaimed: false,

  loadDailyChallenges: async (userId) => {
    if (!isFirestoreAvailable()) {
      set({ loading: false });
      return;
    }
    set({ loading: true });
    try {
      // Get user stats
      const userDoc = await getDocById(COLLECTIONS.USERS, userId);
      const stats: UserStats = {
        totalXp: (userDoc?.totalXp as number) || 0,
        level: (userDoc?.level as number) || 1,
        dailyStreak: (userDoc?.dailyStreak as number) || 0,
        lastCheckIn: userDoc?.lastCheckIn ? new Date(userDoc.lastCheckIn as string) : null,
        coinsEarned: (userDoc?.coinsEarned as number) || 0,
        challengesCompleted: (userDoc?.challengesCompleted as number) || 0,
        badges: (userDoc?.badges as string[]) || [],
      };

      // Check if it's a new day
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastCheck = stats.lastCheckIn ? new Date(stats.lastCheckIn.getFullYear(), stats.lastCheckIn.getMonth(), stats.lastCheckIn.getDate()) : null;
      const isNewDay = !lastCheck || lastCheck.getTime() < today.getTime();
      const streakClaimed = !!(lastCheck && lastCheck.getTime() === today.getTime());

      if (isNewDay) {
        // Generate new challenges for today
        const newChallenges: Challenge[] = CHALLENGE_TYPES.map((t, i) => ({
          id: `challenge_${userId}_${today.getTime()}_${i}`,
          ...t,
          progress: 0,
          completed: false,
          claimed: false,
          expiresAt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          createdAt: now,
        }));
        set({ challenges: newChallenges, userStats: { ...stats, dailyStreak: streakClaimed ? stats.dailyStreak : 0 }, streakClaimed: false });
      } else {
        // Load existing challenges for today
        set({ challenges: [], streakClaimed });
      }
    } catch (err) {
      console.error('loadDailyChallenges error:', err);
    }
    set({ loading: false });
  },

  updateProgress: async (userId, type, amount = 1) => {
    const { challenges } = get();
    const challenge = challenges.find(c => c.type === type && !c.completed);
    if (!challenge) return;

    const newProgress = Math.min(challenge.target, challenge.progress + amount);
    const completed = newProgress >= challenge.target;

    const updated = challenges.map(c =>
      c.id === challenge.id ? { ...c, progress: newProgress, completed } : c
    );
    set({ challenges: updated });

    if (completed) {
      toast.success(`Challenge completed: ${challenge.title}! Claim your reward.`);
    }
  },

  claimReward: async (userId, challengeId) => {
    const { challenges, userStats } = get();
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge || !challenge.completed || challenge.claimed) return;

    const updated = challenges.map(c =>
      c.id === challengeId ? { ...c, claimed: true } : c
    );

    const newStats = {
      ...userStats,
      totalXp: userStats.totalXp + challenge.rewardXp,
      coinsEarned: userStats.coinsEarned + challenge.rewardCoins,
      challengesCompleted: userStats.challengesCompleted + 1,
      level: getLevelFromXp(userStats.totalXp + challenge.rewardXp),
    };

    set({ challenges: updated, userStats: newStats });
    toast.success(`Reward claimed! +${challenge.rewardCoins} coins, +${challenge.rewardXp} XP`);

    if (isFirestoreAvailable()) {
      try {
        await updateDocById(COLLECTIONS.USERS, userId, {
          totalXp: newStats.totalXp,
          coins: newStats.coinsEarned,
          level: newStats.level,
          challengesCompleted: newStats.challengesCompleted,
        });
      } catch (err) {
        console.error('claimReward error:', err);
      }
    }
  },

  checkInDaily: async (userId) => {
    const { userStats, streakClaimed } = get();
    if (streakClaimed) {
      toast.info('Already checked in today!');
      return;
    }

    const now = new Date();
    const lastCheck = userStats.lastCheckIn;
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const isStreak = lastCheck && new Date(lastCheck.getFullYear(), lastCheck.getMonth(), lastCheck.getDate()).getTime() === yesterday.getTime();
    const newStreak = isStreak ? userStats.dailyStreak + 1 : 1;

    // Streak bonus
    const streakBonus = newStreak >= 7 ? 100 : newStreak >= 3 ? 50 : 20;
    const xpBonus = newStreak >= 7 ? 200 : newStreak >= 3 ? 100 : 50;

    const newStats = {
      ...userStats,
      dailyStreak: newStreak,
      lastCheckIn: now,
      totalXp: userStats.totalXp + xpBonus,
      coinsEarned: userStats.coinsEarned + streakBonus,
    };

    set({ userStats: newStats, streakClaimed: true });
    toast.success(`Daily check-in! Streak: ${newStreak} days 🔥 +${streakBonus} coins, +${xpBonus} XP`);

    if (isFirestoreAvailable()) {
      try {
        await updateDocById(COLLECTIONS.USERS, userId, {
          dailyStreak: newStreak,
          lastCheckIn: now.toISOString(),
          totalXp: newStats.totalXp,
          coins: newStats.coinsEarned,
        });
      } catch (err) {
        console.error('checkInDaily error:', err);
      }
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- interface requires this param
  getLeaderboard: async (_limit = 50) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await getDocById(COLLECTIONS.USERS, 'leaderboard');
      return (data?.topUsers as any[]) || [];
    } catch (err) {
      console.error('getLeaderboard error:', err);
      return [];
    }
  },
}));

export { getLevelFromXp, getLevelProgress };
