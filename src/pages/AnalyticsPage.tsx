import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useEnhancedTimelineStore } from '@/store/useEnhancedTimelineStore';
import { usePremiumStore } from '@/store/usePremiumStore';
import {
  Users, Eye, ThumbsUp, MessageCircle, Share2, Bookmark, TrendingUp,
  Crown, ArrowRight, BarChart3, X, Zap, DollarSign
} from 'lucide-react';
import type { CreatorAnalytics } from '@/types';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: typeof Users;
  color: string;
  delay: number;
}

function StatCard({ label, value, icon: Icon, color, delay }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center justify-between mb-2">
        <Icon size={18} style={{ color }} />
        <span className="text-xs font-medium text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </motion.div>
  );
}

function SimpleBarChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <h3 className="font-bold text-gray-900 text-sm mb-3">{label}</h3>
      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-12 text-right shrink-0">{d.label}</span>
            <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(d.value / max) * 100}%` }}
                transition={{ duration: 0.8, delay: i * 0.1 }}
                className="h-full bg-[#00C300] rounded-full"
              />
            </div>
            <span className="text-xs text-gray-600 w-10 shrink-0">{d.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { getCreatorAnalytics } = useEnhancedTimelineStore();
  const { isPremium } = usePremiumStore();
  const [dateRange, setDateRange] = useState<'7' | '30' | '90' | 'all'>('30');
  const [analytics, setAnalytics] = useState<CreatorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      getCreatorAnalytics(user.id).then((data) => {
        setAnalytics(data);
        setLoading(false);
      });
    } else {
      queueMicrotask(() => setLoading(false));
    }
  }, [user?.id, getCreatorAnalytics]);

  const defaultAnalytics: CreatorAnalytics = {
    userId: user?.id || '',
    totalFollowers: 0,
    followersGained: 0,
    followersLost: 0,
    totalPosts: 0,
    totalViews: 0,
    totalLikes: 0,
    totalComments: 0,
    totalShares: 0,
    totalSaves: 0,
    engagementRate: 0,
    topPosts: [],
    dailyActiveAudience: 0,
    watchTime: 0,
    revenue: 0,
    revenueCurrency: 'BDT',
    tipsReceived: 0,
    subscriptionsCount: 0,
    growthChart: [],
  };

  const data = analytics || defaultAnalytics;

  const stats = [
    { label: 'Followers', value: data.totalFollowers, icon: Users, color: '#00C300' },
    { label: 'Total Views', value: data.totalViews, icon: Eye, color: '#3b82f6' },
    { label: 'Engagement', value: `${data.engagementRate.toFixed(1)}%`, icon: TrendingUp, color: '#a855f7' },
    { label: 'Posts', value: data.totalPosts, icon: BarChart3, color: '#f59e0b' },
    { label: 'Likes', value: data.totalLikes, icon: ThumbsUp, color: '#ef4444' },
    { label: 'Comments', value: data.totalComments, icon: MessageCircle, color: '#6366f1' },
    { label: 'Shares', value: data.totalShares, icon: Share2, color: '#10b981' },
    { label: 'Saves', value: data.totalSaves, icon: Bookmark, color: '#f97316' },
    { label: 'Tips', value: `${data.tipsReceived} BDT`, icon: DollarSign, color: '#eab308' },
    { label: 'Revenue', value: `${data.revenue} BDT`, icon: Crown, color: '#8b5cf6' },
  ];

  const audienceData = [
    { label: '18-24', value: 35 },
    { label: '25-34', value: 42 },
    { label: '35-44', value: 18 },
    { label: '45-54', value: 5 },
  ];

  const deviceData = [
    { label: 'Mobile', value: 78 },
    { label: 'Desktop', value: 15 },
    { label: 'Tablet', value: 7 },
  ];

  const genderData = [
    { label: 'Male', value: 52 },
    { label: 'Female', value: 45 },
    { label: 'Other', value: 3 },
  ];

  return (
    <div className="min-h-[100dvh] bg-white">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 z-10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">
              <X size={20} className="text-gray-500" />
            </button>
            <h1 className="font-bold text-lg text-gray-900">Analytics</h1>
          </div>
          <div className="flex items-center gap-1">
            {(['7', '30', '90', 'all'] as const).map((d) => (
              <button type="button" key={d}
                onClick={() => setDateRange(d)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${dateRange === d ? 'bg-[#00C300] text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                {d === 'all' ? 'All' : `${d}d`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Premium banner */}
      {!isPremium && (
        <div className="mx-4 mt-3 bg-gradient-to-r from-[#00C300]/10 to-[#00C300]/5 border border-[#00C300]/20 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#00C300]/10 flex items-center justify-center">
            <Crown size={20} className="text-[#00C300]" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900 text-sm">Unlock Full Analytics</p>
            <p className="text-xs text-gray-500">Get detailed insights, demographics, and growth charts</p>
          </div>
          <button type="button" onClick={() => navigate('/premium')}
            className="px-4 py-2 bg-[#00C300] text-white rounded-lg text-xs font-bold hover:bg-[#00b000] transition-colors"
          >
            Upgrade
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-[#00C300] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="px-4 py-4 space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {stats.map((s, i) => (
              <StatCard key={s.label} {...s} delay={i * 0.05} />
            ))}
          </div>

          {/* Growth Chart */}
          {isPremium && (
            <SimpleBarChart
              data={[
                { label: 'Week 1', value: 78 },
                { label: 'Week 2', value: 92 },
                { label: 'Week 3', value: 85 },
                { label: 'Week 4', value: 110 },
              ]}
              label="Follower Growth (Weekly)"
            />
          )}

          {/* Audience Demographics */}
          {isPremium && (
            <>
              <SimpleBarChart data={audienceData} label="Age Distribution" />
              <SimpleBarChart data={deviceData} label="Device Breakdown" />
              <SimpleBarChart data={genderData} label="Gender Distribution" />
            </>
          )}

          {/* Top Posts */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <h3 className="font-bold text-gray-900 text-sm mb-3">Top Performing Posts</h3>
            {data.topPosts.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No posts yet. Start creating!</p>
            ) : (
              <div className="space-y-2">
                {data.topPosts.slice(0, 5).map((postId, idx) => (
                  <div key={postId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <span className="text-xs font-bold text-[#00C300] w-5">#{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">Post ID: {postId.slice(0, 8)}</p>
                    </div>
                    <ArrowRight size={14} className="text-gray-400" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Engagement tip */}
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <Zap size={20} className="mx-auto text-[#00C300] mb-2" />
            <p className="text-sm font-medium text-gray-900">Boost Your Engagement</p>
            <p className="text-xs text-gray-500 mt-1">Post consistently, use hashtags, and engage with your audience to grow faster</p>
          </div>
        </div>
      )}
    </div>
  );
}
