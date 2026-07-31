import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Wallet, TrendingUp, Users, Eye, ThumbsUp, MessageCircle, Share2,
  Play, ArrowRight, Plus, Video, Radio, BarChart3,
  ChevronRight, Heart, Zap, Crown,
  Banknote, FileText, X,
  Megaphone, Gift, HelpCircle, MousePointer
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useWalletStore } from '@/store/useWalletStore';
import { useEnhancedTimelineStore } from '@/store/useEnhancedTimelineStore';
import { usePremiumStore } from '@/store/usePremiumStore';
import { useReelStore } from '@/store/useReelStore';
import { queryCollection, COLLECTIONS, where, orderBy, isFirestoreAvailable } from '@/lib/firestore';
import type { TimelinePost, CreatorAnalytics, Reel } from '@/types';
import {
  Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';

/* ────────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────────── */
type TimeFilter = 'today' | 'week' | 'month';

interface ChartPoint {
  date: string;
  views: number;
  likes: number;
  followers: number;
}

interface PostRowData {
  post: TimelinePost;
  engagementRate: number;
}

/* ────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────── */
function getFilterStartDate(filter: TimeFilter): Date {
  const now = new Date();
  switch (filter) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

function isWithinFilter(date: Date | string, filter: TimeFilter): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d >= getFilterStartDate(filter);
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function mapPostFromDoc(d: Record<string, unknown>): TimelinePost {
  const rawTs = d.createdAt ?? d.timestamp;
  const timestamp =
    rawTs && typeof rawTs === 'object' && 'toDate' in rawTs
      ? (rawTs as { toDate: () => Date }).toDate()
      : rawTs
        ? new Date(rawTs as string)
        : new Date();
  return {
    id: d.id as string,
    userId: d.userId as string,
    content: (d.content as string) || '',
    images: (d.images as string[]) || [],
    likes: (d.likes as string[]) || [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    comments: (d.comments as any[]) || [],
    shares: (d.shares as string[]) || [],
    timestamp,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visibility: (d.visibility as any) || 'public',
    userName: (d.userName as string) || '',
    userAvatar: (d.userAvatar as string) || '',
    videoUrl: (d.videoUrl as string) || undefined,
    location: (d.location as string) || undefined,
    hashtags: (d.hashtags as string[]) || [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reactions: (d.reactions as any) || undefined,
    savedBy: (d.savedBy as string[]) || [],
    repostedBy: (d.repostedBy as string[]) || [],
    originalPostId: (d.originalPostId as string) || undefined,
    edited: (d.edited as boolean) || false,
    pinned: (d.pinned as boolean) || false,
    commentCount: (d.commentCount as number) || 0,
    shareCount: (d.shareCount as number) || 0,
    viewCount: (d.viewCount as number) || 0,
    reachCount: (d.reachCount as number) || 0,
    impressionCount: (d.impressionCount as number) || 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mediaType: (d.mediaType as any) || 'text',
  };
}

/* ────────────────────────────────────────────────────────────────
   buildChartData helper
   ──────────────────────────────────────────────────────────────── */
function buildChartData(
  posts: TimelinePost[],
  _analytics: CreatorAnalytics | null,
  currentUser: { followers?: string[] } | null,
  filter: TimeFilter = 'month'
): ChartPoint[] {
  const filtered = posts.filter((p) => isWithinFilter(p.timestamp, filter));
  if (filtered.length === 0) return [];

  const dateMap = new Map<string, { views: number; likes: number }>();
  filtered.forEach((post) => {
    const dateStr = post.timestamp.toISOString().split('T')[0];
    const existing = dateMap.get(dateStr) || { views: 0, likes: 0 };
    existing.views += post.viewCount || 0;
    existing.likes += post.likes.length;
    dateMap.set(dateStr, existing);
  });

  const sorted = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const totalF = currentUser?.followers?.length || 0;

  return sorted.map((entry, idx) => ({
    date: entry[0],
    views: entry[1].views,
    likes: entry[1].likes,
    followers: totalF > 0 ? Math.round((totalF * (idx + 1)) / sorted.length) : 0,
  }));
}

/* ────────────────────────────────────────────────────────────────
   Sub-components
   ──────────────────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div className="rounded-xl p-4 animate-pulse" style={{ background: '#1a1a1a' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="w-8 h-8 rounded-full" style={{ background: '#2a2a2a' }} />
        <div className="w-16 h-3 rounded" style={{ background: '#2a2a2a' }} />
      </div>
      <div className="w-24 h-6 rounded mb-2" style={{ background: '#2a2a2a' }} />
      <div className="w-12 h-3 rounded" style={{ background: '#2a2a2a' }} />
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="rounded-xl p-4 animate-pulse h-80" style={{ background: '#1a1a1a' }}>
      <div className="w-32 h-4 rounded mb-4" style={{ background: '#2a2a2a' }} />
      <div className="w-full h-60 rounded" style={{ background: '#2a2a2a' }} />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3 animate-pulse">
      <div className="w-10 h-10 rounded-lg shrink-0" style={{ background: '#2a2a2a' }} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="w-3/4 h-3 rounded" style={{ background: '#2a2a2a' }} />
        <div className="w-1/2 h-3 rounded" style={{ background: '#2a2a2a' }} />
      </div>
    </div>
  );
}

interface EarningsCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: typeof Wallet;
  color: string;
  delay: number;
}

function EarningsCard({ label, value, subValue, icon: Icon, color, delay }: EarningsCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="rounded-xl p-4 cursor-pointer hover:opacity-90 transition-opacity"
      style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon size={20} style={{ color }} />
        </div>
        <span className="text-xs font-medium" style={{ color: '#888' }}>{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {subValue && <p className="text-xs mt-1" style={{ color: '#666' }}>{subValue}</p>}
    </motion.div>
  );
}

interface InsightCardProps {
  label: string;
  value: string | number;
  icon: typeof Users;
  color: string;
  delay: number;
}

function InsightCard({ label, value, icon: Icon, color, delay }: InsightCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.4 }}
      className="rounded-xl p-4 flex items-center gap-3"
      style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
    >
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-lg font-bold text-white">{typeof value === 'number' ? formatNumber(value) : value}</p>
        <p className="text-xs" style={{ color: '#888' }}>{label}</p>
      </div>
    </motion.div>
  );
}

interface QuickActionProps {
  label: string;
  icon: typeof Plus;
  color: string;
  onClick: () => void;
  delay: number;
}

function QuickAction({ label, icon: Icon, color, onClick, delay }: QuickActionProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl p-3 text-left hover:brightness-110 transition-all"
      style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
        <Icon size={18} style={{ color }} />
      </div>
      <span className="text-sm font-medium text-white">{label}</span>
      <ChevronRight size={14} className="ml-auto shrink-0" style={{ color: '#666' }} />
    </motion.button>
  );
}

interface PostTableRowProps {
  data: PostRowData;
  index: number;
  onClick: () => void;
}

function PostTableRow({ data, index, onClick }: PostTableRowProps) {
  const { post, engagementRate } = data;
  const preview = post.content.slice(0, 60) || (post.images.length ? 'Image post' : 'Video post');
  const mediaType = post.videoUrl ? 'video' : post.images.length ? 'image' : 'text';

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className="flex items-center gap-3 py-3 px-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
    >
      <span className="text-xs font-bold w-5 text-center shrink-0" style={{ color: '#00C300' }}>#{index + 1}</span>
      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center" style={{ background: '#2a2a2a' }}>
        {post.images.length > 0 ? (
          <img src={post.images[0]} alt="" className="w-full h-full object-cover" />
        ) : post.videoUrl ? (
          <Video size={16} style={{ color: '#FF4081' }} />
        ) : (
          <FileText size={16} style={{ color: '#888' }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{preview}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#2a2a2a', color: '#aaa' }}>
            {mediaType}
          </span>
          <span className="text-[10px]" style={{ color: '#666' }}>
            {post.timestamp.toLocaleDateString()}
          </span>
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-4 text-xs shrink-0" style={{ color: '#aaa' }}>
        <span className="flex items-center gap-1"><Eye size={12} /> {formatNumber(post.viewCount || 0)}</span>
        <span className="flex items-center gap-1"><ThumbsUp size={12} /> {formatNumber(post.likes.length)}</span>
        <span className="flex items-center gap-1"><MessageCircle size={12} /> {formatNumber(post.comments.length)}</span>
        <span className="flex items-center gap-1"><Share2 size={12} /> {formatNumber(post.shares.length)}</span>
      </div>
      <div className="text-right shrink-0 min-w-[60px]">
        <p className="text-sm font-bold" style={{ color: engagementRate > 5 ? '#00C300' : '#FF9800' }}>
          {engagementRate.toFixed(1)}%
        </p>
        <p className="text-[10px]" style={{ color: '#666' }}>Engagement</p>
      </div>
      <ChevronRight size={14} className="shrink-0" style={{ color: '#666' }} />
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Custom Tooltip for Recharts
   ──────────────────────────────────────────────────────────────── */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; name: string; value: number; color: string }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg p-3 text-sm" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        <p className="font-medium text-white mb-1">{formatDateLabel(label || '')}</p>
        {payload.map((p) => (
          <p key={p.dataKey} className="text-xs" style={{ color: p.color }}>
            {p.name}: {formatNumber(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────
   Main Page
   ──────────────────────────────────────────────────────────────── */
export default function CreatorDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { wallet, subscribeWallet } = useWalletStore();
  const { getCreatorAnalytics } = useEnhancedTimelineStore();
  const {
    subscribeToPremium, fetchTips, tipsReceived, creatorRevenue, creatorSubscribers, isPremium
  } = usePremiumStore();
  const { getMyReels } = useReelStore();

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<CreatorAnalytics | null>(null);
  const [userPosts, setUserPosts] = useState<TimelinePost[]>([]);
  const [userReels, setUserReels] = useState<Reel[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);

  /* ── Data loading ── */

  useEffect(() => {
    if (!user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);

      try {
        // Subscribe to wallet & premium
        const unsubWallet = subscribeWallet(user.id);
        const unsubPremium = subscribeToPremium(user.id);

        // Fetch tips
        await fetchTips(user.id);

        // Fetch analytics
        const creatorAnalytics = await getCreatorAnalytics(user.id);
        if (!cancelled) setAnalytics(creatorAnalytics);

        // Fetch user posts directly from Firestore
        let posts: TimelinePost[] = [];
        if (isFirestoreAvailable()) {
          try {
            const raw = await queryCollection(COLLECTIONS.POSTS, [
              where('userId', '==', user.id),
              orderBy('timestamp', 'desc'),
            ]);
            posts = (raw || []).map(mapPostFromDoc);
          } catch {
            posts = [];
          }
        }
        if (!cancelled) setUserPosts(posts);

        // Fetch user reels
        let reels: Reel[] = [];
        try {
          reels = await getMyReels(user.id);
        } catch {
          reels = [];
        }
        if (!cancelled) setUserReels(reels);

        // Build chart data
        const chart = buildChartData(posts, creatorAnalytics, user);
        if (!cancelled) setChartData(chart);

        if (!cancelled) setLoading(false);

        // Cleanup subscriptions on unmount
        return () => {
          unsubWallet();
          unsubPremium();
        };
      } catch (err) {
        console.error('[CreatorDashboard] load error:', err);
        if (!cancelled) setLoading(false);
      }
    };

    const cleanupPromise = load();
    return () => {
      cancelled = true;
      cleanupPromise.then((cleanup) => cleanup?.()).catch(() => {});
    };
  }, [user, subscribeWallet, subscribeToPremium, fetchTips, getCreatorAnalytics, getMyReels]);

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChartData(buildChartData(userPosts, analytics, user, timeFilter));
    }
  }, [timeFilter, userPosts, analytics, user]);

  /* ── Computed stats ── */
  const totalEarnings = useMemo(() => {
    const coins = wallet?.coins || 0;
    const usd = wallet?.usdBalance || 0;
    // Estimate coin value in USD using exchange rate ~0.10
    const coinUsd = coins * 0.10;
    return usd + coinUsd;
  }, [wallet]);

  const tipsAmount = useMemo(() => {
    return tipsReceived
      .filter((tip) => isWithinFilter(tip.timestamp, timeFilter))
      .reduce((sum, tip) => sum + (tip.currency === 'coins' ? tip.amount * 0.10 : tip.amount), 0);
  }, [tipsReceived, timeFilter]);

  const subscriptionRevenue = useMemo(() => {
    // Use creatorRevenue from premium store or analytics revenue, scaled by time filter
    const base = creatorRevenue || analytics?.revenue || 0;
    if (timeFilter === 'today') return base / 30;
    if (timeFilter === 'week') return base / 4;
    return base;
  }, [creatorRevenue, analytics?.revenue, timeFilter]);

  const adRevenue = useMemo(() => {
    // Derive from analytics revenue minus subscription portion
    const total = analytics?.revenue || 0;
    const sub = subscriptionRevenue;
    const ad = Math.max(0, total - sub);
    return ad;
  }, [analytics?.revenue, subscriptionRevenue]);

  const postStats = useMemo(() => {
    const filtered = userPosts.filter((p) => isWithinFilter(p.timestamp, timeFilter));
    const totalViews = filtered.reduce((s, p) => s + (p.viewCount || 0), 0);
    const totalLikes = filtered.reduce((s, p) => s + p.likes.length, 0);
    const totalComments = filtered.reduce((s, p) => s + p.comments.length, 0);
    const totalShares = filtered.reduce((s, p) => s + p.shares.length, 0);
    const engagementRate = totalViews > 0 ? ((totalLikes + totalComments + totalShares) / totalViews) * 100 : 0;
    return { totalViews, totalLikes, totalComments, totalShares, engagementRate, count: filtered.length };
  }, [userPosts, timeFilter]);

  const topPosts = useMemo(() => {
    const filtered = userPosts.filter((p) => isWithinFilter(p.timestamp, timeFilter));
    const withEngagement = filtered.map((post) => {
      const engagement =
        post.likes.length + post.comments.length + post.shares.length + (post.savedBy?.length || 0);
      const rate = (post.viewCount || 0) > 0 ? (engagement / (post.viewCount || 1)) * 100 : 0;
      return { post, engagementRate: rate };
    });
    return withEngagement.sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 10);
  }, [userPosts, timeFilter]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const followerCount = useMemo(() => (user as any)?.followers?.length || 0, [user]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const followingCount = useMemo(() => (user as any)?.following?.length || 0, [user]);
  const totalPostsCount = useMemo(() => userPosts.length, [userPosts]);
  const reelCount = useMemo(() => userReels.length, [userReels]);
  const totalViewsAll = useMemo(() => userPosts.reduce((s, p) => s + (p.viewCount || 0), 0), [userPosts]);

  /* ── Navigation guards ── */
  const goTo = useCallback((path: string) => navigate(path), [navigate]);

  /* ── Render ── */
  if (!user) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: '#0d0d0d' }}>
        <div className="text-center p-6">
          <Users size={48} className="mx-auto mb-4" style={{ color: '#2a2a2a' }} />
          <h2 className="text-xl font-bold text-white mb-2">Sign in to view your Creator Dashboard</h2>
          <p className="text-sm mb-4" style={{ color: '#888' }}>Track your earnings, growth, and content performance.</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 rounded-lg text-white font-medium text-sm transition-colors hover:brightness-110"
            style={{ background: '#00C300' }}
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] pb-20" style={{ background: '#0d0d0d' }}>
      {/* Header */}
      <div className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between" style={{ background: '#0d0d0d', borderBottom: '1px solid #2a2a2a' }}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <X size={20} style={{ color: '#fff' }} />
          </button>
          <div>
            <h1 className="font-bold text-white text-lg leading-tight">Creator Dashboard</h1>
            <p className="text-xs" style={{ color: '#888' }}>Welcome back, {user.name || user.displayName || 'Creator'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg p-1" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          {(['today', 'week', 'month'] as TimeFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setTimeFilter(f)}
              className="px-3 py-1 rounded-md text-xs font-medium transition-all"
              style={{
                background: timeFilter === f ? '#00C300' : 'transparent',
                color: timeFilter === f ? '#fff' : '#aaa',
              }}
            >
              {f === 'today' ? 'Today' : f === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-5 max-w-6xl mx-auto">
        {/* ── Earnings Overview ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Wallet size={16} style={{ color: '#FF9800' }} />
              Earnings Overview
            </h2>
            <button onClick={() => goTo('/wallet')} className="text-xs flex items-center gap-1 hover:underline" style={{ color: '#00C300' }}>
              View Wallet <ArrowRight size={12} />
            </button>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <EarningsCard
                label="Total Earnings"
                value={`$${totalEarnings.toFixed(2)}`}
                subValue={`${wallet?.coins || 0} coins`}
                icon={Wallet}
                color="#FF9800"
                delay={0}
              />
              <EarningsCard
                label="Tips Received"
                value={`$${tipsAmount.toFixed(2)}`}
                subValue={`${tipsReceived.filter(t => isWithinFilter(t.timestamp, timeFilter)).length} tips`}
                icon={Gift}
                color="#FF4081"
                delay={0.05}
              />
              <EarningsCard
                label="Subscription Rev"
                value={`$${subscriptionRevenue.toFixed(2)}`}
                subValue={`${creatorSubscribers || 0} subscribers`}
                icon={Crown}
                color="#7B61FF"
                delay={0.1}
              />
              <EarningsCard
                label="Ad Revenue"
                value={`$${adRevenue.toFixed(2)}`}
                subValue={`From ${postStats.count} posts`}
                icon={Megaphone}
                color="#00BCD4"
                delay={0.15}
              />
            </div>
          )}
        </section>

        {/* ── Growth Chart ── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl p-4" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp size={16} style={{ color: '#00C300' }} />
                Growth & Activity
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#2a2a2a', color: '#aaa' }}>
                Last 30 days
              </span>
            </div>
            {loading ? (
              <SkeletonChart />
            ) : chartData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center">
                <BarChart3 size={36} style={{ color: '#2a2a2a' }} className="mb-2" />
                <p className="text-sm text-white font-medium">No activity data yet</p>
                <p className="text-xs mt-1" style={{ color: '#666' }}>Start posting to see your growth chart</p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00C300" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#00C300" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorLikes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF4081" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#FF4081" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateLabel}
                      tick={{ fill: '#888', fontSize: 11 }}
                      axisLine={{ stroke: '#2a2a2a' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#888', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formatNumber(v)}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', color: '#aaa' }}
                      iconType="circle"
                      iconSize={8}
                    />
                    <Area
                      type="monotone"
                      dataKey="views"
                      name="Views"
                      stroke="#00C300"
                      strokeWidth={2}
                      fill="url(#colorViews)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#00C300' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="likes"
                      name="Likes"
                      stroke="#FF4081"
                      strokeWidth={2}
                      fill="url(#colorLikes)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#FF4081' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="followers"
                      name="Followers"
                      stroke="#FF9800"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="4 4"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* ── Audience Insights ── */}
          <div className="rounded-xl p-4" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Users size={16} style={{ color: '#7B61FF' }} />
              Audience Insights
            </h2>
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
              </div>
            ) : (
              <div className="space-y-3">
                <InsightCard label="Followers" value={followerCount} icon={Users} color="#00C300" delay={0} />
                <InsightCard label="Following" value={followingCount} icon={Eye} color="#00BCD4" delay={0.05} />
                <InsightCard label="Total Posts" value={totalPostsCount} icon={FileText} color="#FF9800" delay={0.1} />
                <InsightCard label="Total Reels" value={reelCount} icon={Video} color="#FF4081" delay={0.15} />
                <InsightCard label="Total Views" value={totalViewsAll} icon={MousePointer} color="#7B61FF" delay={0.2} />
                <div className="rounded-lg p-3 mt-2" style={{ background: '#0d0d0d', border: '1px solid #2a2a2a' }}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span style={{ color: '#888' }}>Engagement Rate</span>
                    <span className="font-bold" style={{ color: postStats.engagementRate > 5 ? '#00C300' : '#FF9800' }}>
                      {postStats.engagementRate.toFixed(2)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#2a2a2a' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(postStats.engagementRate * 5, 100)}%` }}
                      transition={{ duration: 0.8 }}
                      className="h-full rounded-full"
                      style={{ background: postStats.engagementRate > 5 ? '#00C300' : '#FF9800' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Content Performance ── */}
        <section className="rounded-xl p-4" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap size={16} style={{ color: '#FF9800' }} />
              Content Performance
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px]" style={{ color: '#666' }}>
                {topPosts.length} posts
              </span>
              <button onClick={() => goTo('/timeline')} className="text-xs flex items-center gap-1 hover:underline" style={{ color: '#00C300' }}>
                View All <ArrowRight size={12} />
              </button>
            </div>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
            </div>
          ) : topPosts.length === 0 ? (
            <div className="text-center py-8">
              <FileText size={36} style={{ color: '#2a2a2a' }} className="mx-auto mb-2" />
              <p className="text-sm text-white font-medium">No posts in this period</p>
              <p className="text-xs mt-1" style={{ color: '#666' }}>Create your first post to start tracking performance</p>
              <button
                onClick={() => goTo('/timeline')}
                className="mt-3 px-4 py-2 rounded-lg text-xs font-medium text-white transition-colors hover:brightness-110"
                style={{ background: '#00C300' }}
              >
                Create Post
              </button>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#2a2a2a' }}>
              {topPosts.map((item, idx) => (
                <PostTableRow
                  key={item.post.id}
                  data={item}
                  index={idx}
                  onClick={() => goTo(`/timeline?post=${item.post.id}`)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Reels Performance (if any) ── */}
        {userReels.length > 0 && (
          <section className="rounded-xl p-4" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Play size={16} style={{ color: '#FF4081' }} />
                Reels Performance
              </h2>
              <button onClick={() => goTo('/reels')} className="text-xs flex items-center gap-1 hover:underline" style={{ color: '#00C300' }}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {userReels.slice(0, 5).map((reel, idx) => (
                <motion.div
                  key={reel.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => goTo('/reels')}
                  className="rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ background: '#2a2a2a', border: '1px solid #2a2a2a' }}
                >
                  <div className="aspect-[9/16] relative flex items-center justify-center" style={{ background: '#1a1a1a' }}>
                    {reel.thumbnailUrl ? (
                      <img src={reel.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Video size={24} style={{ color: '#666' }} />
                    )}
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded">
                      <Eye size={10} /> {formatNumber(reel.viewCount || 0)}
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-xs text-white truncate">{reel.caption || 'Reel'}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px]" style={{ color: '#888' }}>
                      <span className="flex items-center gap-0.5"><Heart size={10} /> {reel.likes.length}</span>
                      <span className="flex items-center gap-0.5"><MessageCircle size={10} /> {reel.comments.length}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* ── Quick Actions ── */}
        <section className="rounded-xl p-4" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Zap size={16} style={{ color: '#FF9800' }} />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <QuickAction label="Create Post" icon={Plus} color="#00C300" onClick={() => goTo('/timeline')} delay={0} />
            <QuickAction label="Create Reel" icon={Video} color="#FF4081" onClick={() => goTo('/create-reel')} delay={0.05} />
            <QuickAction label="Go Live" icon={Radio} color="#FF9800" onClick={() => goTo('/live-streams')} delay={0.1} />
            <QuickAction label="Analytics" icon={BarChart3} color="#7B61FF" onClick={() => goTo('/analytics')} delay={0.15} />
            <QuickAction label="Withdraw" icon={Banknote} color="#00BCD4" onClick={() => goTo('/wallet')} delay={0.2} />
          </div>
        </section>

        {/* ── Premium Upsell ── */}
        {!isPremium && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-4 flex items-center gap-4"
            style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #0d2a0d 100%)', border: '1px solid #00C30030' }}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: '#00C30015' }}>
              <Crown size={24} style={{ color: '#00C300' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Unlock Creator Tools</p>
              <p className="text-xs mt-0.5" style={{ color: '#aaa' }}>
                Get detailed analytics, ad revenue sharing, fan subscriptions, and priority support with the Creator plan.
              </p>
            </div>
            <button
              onClick={() => goTo('/premium')}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors hover:brightness-110 shrink-0"
              style={{ background: '#00C300' }}
            >
              Upgrade
            </button>
          </motion.section>
        )}

        {/* ── Help / Tip ── */}
        <div className="text-center py-4">
          <p className="text-xs" style={{ color: '#555' }}>
            <HelpCircle size={12} className="inline mr-1" />
            Data refreshes automatically. Earnings are estimates and may vary.
          </p>
        </div>
      </div>
    </div>
  );
}
