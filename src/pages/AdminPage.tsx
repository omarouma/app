/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Shield, AlertTriangle, Check, X, Ban, UserCheck,
  Loader, RefreshCw, Eye, Search, Filter, Users, FileText, BarChart3,
  UserX, UserPlus, Crown, Trash2, MessageSquare, Heart, Flag, TrendingUp,
  Activity, MessageCircle, MousePointerClick, ChevronRight
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import {
  isFirestoreAvailable, queryCollection, updateDocById, deleteDocById,
  COLLECTIONS
} from '@/lib/firestore';
import { toast } from 'sonner';
import { where, orderBy, limit } from '@/lib/firestore';
import type { User, TimelinePost, UserReport, AdminDashboardStats } from '@/types';

type Tab = 'reports' | 'users' | 'content' | 'analytics';
type UserFilter = 'all' | 'verified' | 'suspended' | 'banned' | 'admins';

export default function AdminPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('reports');

  // Reports state
  const [reports, setReports] = useState<UserReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'reviewing' | 'resolved' | 'dismissed'>('pending');
  const [reportSearch, setReportSearch] = useState('');
  const [processingReportId, setProcessingReportId] = useState<string | null>(null);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);

  // Content state
  const [posts, setPosts] = useState<TimelinePost[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentSearch, setContentSearch] = useState('');
  const [processingPostId, setProcessingPostId] = useState<string | null>(null);
  const [reportedComments, setReportedComments] = useState<{ id: string; userId: string; content: string; postId: string; timestamp: Date; reports: number }[]>([]);

  // Analytics state
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [userGrowth, setUserGrowth] = useState<{ day: string; count: number }[]>([]);
  const [postActivity, setPostActivity] = useState<{ day: string; count: number }[]>([]);

  // Route guard: non-admins get booted
  useEffect(() => {
    if (!user?.isAdmin) {
      toast.error('Admin access only');
      navigate('/');
    }
  }, [user?.isAdmin, navigate]);

  // ─── Reports ───
  const fetchReports = async () => {
    if (!isFirestoreAvailable() || !user?.isAdmin) return;
    setReportsLoading(true);
    try {
      const constraints: any[] = [orderBy('timestamp', 'desc')];
      if (reportFilter !== 'all') {
        constraints.push(where('status', '==', reportFilter));
      }
      const data = await queryCollection(COLLECTIONS.REPORTS, constraints);
      const list: UserReport[] = (data || []).map((d: any) => ({
        id: d.id,
        reporterId: d.reporterId || d.reporter_id,
        reportedId: d.reportedId || d.reported_id,
        reason: d.reason,
        details: d.details || '',
        status: d.status,
        reviewedBy: d.reviewedBy || d.reviewed_by,
        reviewedAt: d.reviewedAt ? new Date(d.reviewedAt) : (d.reviewed_at ? new Date(d.reviewed_at) : undefined),
        actionTaken: d.actionTaken || d.action_taken || '',
        createdAt: new Date(d.timestamp || d.createdAt || d.created_at),
        contentId: d.contentId,
        contentType: d.contentType,
        severity: d.severity,
      }));
      setReports(list);
    } catch (err) {
      console.error(err);
    }
    setReportsLoading(false);
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (activeTab === 'reports') queueMicrotask(() => fetchReports());
  }, [reportFilter, activeTab, user?.isAdmin]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const updateReportStatus = async (reportId: string, status: string, action: string) => {
    if (!isFirestoreAvailable() || !user?.isAdmin) return;
    setProcessingReportId(reportId);
    try {
      await updateDocById(COLLECTIONS.REPORTS, reportId, {
        status,
        reviewedBy: user.id,
        reviewedAt: new Date().toISOString(),
        actionTaken: action,
      });
      toast.success(`Report ${status}`);
      fetchReports();
    } catch {
      toast.error('Failed to update report');
    }
    setProcessingReportId(null);
  };

  // ─── Users ───
  const fetchUsers = async () => {
    if (!isFirestoreAvailable() || !user?.isAdmin) return;
    setUsersLoading(true);
    try {
      const data = await queryCollection(COLLECTIONS.USERS, [orderBy('createdAt', 'desc')]);
      const list: User[] = (data || []).map((d: any) => ({
        id: d.id,
        name: d.name || d.displayName || 'Unnamed',
        displayName: d.displayName || d.name,
        username: d.username || '',
        email: d.email || '',
        phone: d.phone || '',
        avatar: d.avatar || '',
        status: d.status || 'active',
        createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
        verified: d.verified || false,
        isAdmin: d.isAdmin || false,
        bio: d.bio || '',
        friendCount: d.friendCount || 0,
        lastSeen: d.lastSeen ? new Date(d.lastSeen) : null,
        coins: d.coins || 0,
      }));
      setUsers(list);
    } catch (err) {
      console.error(err);
    }
    setUsersLoading(false);
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (activeTab === 'users') queueMicrotask(() => fetchUsers());
  }, [activeTab]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const updateUserStatus = async (targetUser: User, updates: Partial<User>, actionLabel: string) => {
    if (!isFirestoreAvailable() || !user?.isAdmin) return;
    setProcessingUserId(targetUser.id);
    try {
      await updateDocById(COLLECTIONS.USERS, targetUser.id, updates);
      toast.success(`${targetUser.name} ${actionLabel}`);
      fetchUsers();
    } catch {
      toast.error('Failed to update user');
    }
    setProcessingUserId(null);
  };

  const getUserStatus = (u: User): 'active' | 'verified' | 'suspended' | 'banned' | 'admin' => {
    if (u.isAdmin) return 'admin';
    if (u.status === 'banned') return 'banned';
    if (u.status === 'suspended') return 'suspended';
    if (u.verified) return 'verified';
    return 'active';
  };

  const filteredUsers = useMemo(() => {
    let list = users;
    if (userSearch) {
      const q = userSearch.toLowerCase();
      list = list.filter((u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.id || '').toLowerCase().includes(q)
      );
    }
    if (userFilter !== 'all') {
      list = list.filter((u) => {
        const s = getUserStatus(u);
        if (userFilter === 'verified') return s === 'verified';
        if (userFilter === 'suspended') return s === 'suspended';
        if (userFilter === 'banned') return s === 'banned';
        if (userFilter === 'admins') return s === 'admin';
        return true;
      });
    }
    return list;
  }, [users, userSearch, userFilter]);

  // ─── Content ───
  const fetchContent = async () => {
    if (!isFirestoreAvailable() || !user?.isAdmin) return;
    setContentLoading(true);
    try {
      const postsData = await queryCollection(COLLECTIONS.POSTS, [orderBy('timestamp', 'desc'), limit(50)]);
      const postsList: TimelinePost[] = (postsData || []).map((d: any) => ({
        id: d.id,
        userId: d.userId || '',
        content: d.content || '',
        images: d.images || [],
        likes: d.likes || [],
        comments: d.comments || [],
        shares: d.shares || [],
        timestamp: new Date(d.timestamp || d.createdAt),
        visibility: d.visibility || 'public',
        userName: d.userName || '',
        userAvatar: d.userAvatar || '',
        mediaType: d.mediaType || 'text',
      }));
      setPosts(postsList);

      // Build reported comments from reports
      const reportsData = await queryCollection(COLLECTIONS.REPORTS, [
        where('contentType', '==', 'comment'),
        where('status', '==', 'pending'),
      ]);
      const commentMap = new Map<string, { id: string; userId: string; content: string; postId: string; timestamp: Date; reports: number }>();
      (reportsData || []).forEach((r: any) => {
        const key = r.contentId || r.id;
        if (commentMap.has(key)) {
          const existing = commentMap.get(key)!;
          existing.reports += 1;
        } else {
          commentMap.set(key, {
            id: key,
            userId: r.reportedId || '',
            content: r.details || 'No content',
            postId: r.postId || '',
            timestamp: new Date(r.timestamp || r.createdAt),
            reports: 1,
          });
        }
      });
      setReportedComments(Array.from(commentMap.values()));
    } catch (err) {
      console.error(err);
    }
    setContentLoading(false);
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (activeTab === 'content') queueMicrotask(() => fetchContent());
  }, [activeTab]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const deletePost = async (postId: string) => {
    if (!isFirestoreAvailable() || !user?.isAdmin) return;
    setProcessingPostId(postId);
    try {
      await deleteDocById(COLLECTIONS.POSTS, postId);
      toast.success('Post deleted');
      fetchContent();
    } catch {
      toast.error('Failed to delete post');
    }
    setProcessingPostId(null);
  };

  const hidePost = async (post: TimelinePost) => {
    if (!isFirestoreAvailable() || !user?.isAdmin) return;
    setProcessingPostId(post.id);
    try {
      await updateDocById(COLLECTIONS.POSTS, post.id, { visibility: 'private' });
      toast.success('Post hidden');
      fetchContent();
    } catch {
      toast.error('Failed to hide post');
    }
    setProcessingPostId(null);
  };

  const filteredPosts = useMemo(() => {
    if (!contentSearch) return posts;
    const q = contentSearch.toLowerCase();
    return posts.filter((p) =>
      (p.content || '').toLowerCase().includes(q) ||
      (p.userName || '').toLowerCase().includes(q) ||
      (p.userId || '').toLowerCase().includes(q)
    );
  }, [posts, contentSearch]);

  // ─── Analytics ───
  const fetchAnalytics = async () => {
    if (!isFirestoreAvailable() || !user?.isAdmin) return;
    setAnalyticsLoading(true);
    try {
      const allUsers = await queryCollection(COLLECTIONS.USERS, []);
      const allPosts = await queryCollection(COLLECTIONS.POSTS, []);
      const allMessages = await queryCollection(COLLECTIONS.MESSAGES, []);
      const pendingReports = await queryCollection(COLLECTIONS.REPORTS, [where('status', '==', 'pending')]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newUsersToday = (allUsers || []).filter((u: any) => {
        const d = u.createdAt ? new Date(u.createdAt) : null;
        return d && d >= today;
      }).length;

      const activeToday = (allUsers || []).filter((u: any) => {
        const d = u.lastSeen ? new Date(u.lastSeen) : null;
        return d && d >= today;
      }).length;

      const dashboardStats: AdminDashboardStats = {
        totalUsers: allUsers.length,
        dailyActiveUsers: activeToday,
        weeklyActiveUsers: 0,
        monthlyActiveUsers: 0,
        newUsersToday,
        totalPosts: allPosts.length,
        totalMessages: allMessages.length,
        totalCalls: 0,
        totalTransactions: 0,
        revenue: 0,
        premiumUsers: 0,
        reportedContent: 0,
        pendingReports: pendingReports.length,
        bannedUsers: 0,
        activeAds: 0,
        totalTips: 0,
        totalReferrals: 0,
        topHashtags: [],
        serverUptime: 99.9,
        growthRate: 0,
      };
      setStats(dashboardStats);

      // User growth last 7 days
      const days: { day: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        const count = (allUsers || []).filter((u: any) => {
          const cd = u.createdAt ? new Date(u.createdAt) : null;
          return cd && cd >= d && cd < next;
        }).length;
        days.push({ day: d.toLocaleDateString('en', { weekday: 'short' }), count });
      }
      setUserGrowth(days);

      // Post activity last 7 days
      const postDays: { day: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        const count = (allPosts || []).filter((p: any) => {
          const cd = p.timestamp ? new Date(p.timestamp) : null;
          return cd && cd >= d && cd < next;
        }).length;
        postDays.push({ day: d.toLocaleDateString('en', { weekday: 'short' }), count });
      }
      setPostActivity(postDays);
    } catch (err) {
      console.error(err);
    }
    setAnalyticsLoading(false);
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (activeTab === 'analytics') queueMicrotask(() => fetchAnalytics());
  }, [activeTab]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // ─── Derived stats ───
  const reportStats = useMemo(() => ({
    pending: reports.filter((r) => r.status === 'pending').length,
    reviewing: reports.filter((r) => r.status === 'reviewing').length,
    resolved: reports.filter((r) => r.status === 'resolved').length,
    dismissed: reports.filter((r) => r.status === 'dismissed').length,
  }), [reports]);

  const filteredReports = useMemo(() => {
    if (!reportSearch) return reports;
    const q = reportSearch.toLowerCase();
    return reports.filter((r) =>
      r.reason.toLowerCase().includes(q) ||
      r.details?.toLowerCase().includes(q) ||
      r.reporterId.toLowerCase().includes(q) ||
      r.reportedId.toLowerCase().includes(q)
    );
  }, [reports, reportSearch]);

  if (!user?.isAdmin) {
    return (
      <div className="h-full flex flex-col bg-[#0d0d0d]">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
            <p className="text-[#8D8D8D] mb-4">This page is for administrators only.</p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-6 py-2.5 rounded-xl bg-[#00C300] text-black font-semibold text-sm hover:bg-[#00C300]/90 transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'reports', label: 'Reports', icon: AlertTriangle },
    { key: 'users', label: 'Users', icon: Users },
    { key: 'content', label: 'Content', icon: FileText },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const maxUserGrowth = Math.max(...userGrowth.map((d) => d.count), 1);
  const maxPostActivity = Math.max(...postActivity.map((d) => d.count), 1);

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-[#EBEBEB]">
        <div className="flex items-center gap-3 p-4">
          <button type="button" onClick={() => navigate(-1)} className="text-[#111111] hover:text-[#8D8D8D] p-1 -ml-1">
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#111111]">Admin Dashboard</h1>
            <p className="text-[#8D8D8D] text-xs">Moderation & Analytics</p>
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => {
                if (activeTab === 'reports') fetchReports();
                if (activeTab === 'users') fetchUsers();
                if (activeTab === 'content') fetchContent();
                if (activeTab === 'analytics') fetchAnalytics();
              }}
              className="p-2 text-[#8D8D8D] hover:text-[#00C300] active:bg-[#F5F5F5] rounded-full transition-colors"
            >
              <RefreshCw size={18} />
            </button>
            <div className="w-9 h-9 rounded-full bg-[#00C300]/10 flex items-center justify-center">
              <Shield size={18} className="text-[#00C300]" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-4 pb-2 gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <button type="button" key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive ? 'bg-[#00C300] text-white' : 'bg-[#F5F5F5] text-[#8D8D8D] hover:text-[#111111]'
                }`}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ================= REPORTS TAB ================= */}
        {activeTab === 'reports' && (
          <motion.div
            key="reports"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-2 p-4">
              {[
                { label: 'Pending', value: reportStats.pending, color: 'text-[#FF9800]' },
                { label: 'Reviewing', value: reportStats.reviewing, color: 'text-[#2196F3]' },
                { label: 'Resolved', value: reportStats.resolved, color: 'text-[#00C300]' },
                { label: 'Dismissed', value: reportStats.dismissed, color: 'text-[#8D8D8D]' },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-xl border border-[#EBEBEB] p-3 text-center">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[#8D8D8D] text-[10px] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Search & Filter */}
            <div className="px-4 pb-3">
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
                  <input
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    placeholder="Search reports..."
                    className="w-full bg-white border border-[#EBEBEB] rounded-xl pl-9 pr-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
                  />
                </div>
                <button type="button" className="p-2.5 bg-white border border-[#EBEBEB] rounded-xl text-[#8D8D8D]">
                  <Filter size={16} />
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                {(['all', 'pending', 'reviewing', 'resolved', 'dismissed'] as const).map((f) => (
                  <button type="button" key={f}
                    onClick={() => setReportFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      reportFilter === f ? 'bg-[#00C300] text-white' : 'bg-white border border-[#EBEBEB] text-[#8D8D8D]'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Reports List */}
            <div className="px-4 pb-20 space-y-3">
              {reportsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader size={24} className="text-[#00C300] animate-spin" />
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="text-center py-12">
                  <Shield size={40} className="text-[#EBEBEB] mx-auto mb-3" />
                  <p className="text-[#8D8D8D] text-sm font-medium">No reports found</p>
                  <p className="text-[#C7C7CC] text-xs mt-1">All caught up!</p>
                </div>
              ) : (
                filteredReports.map((report, i) => (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white rounded-xl border border-[#EBEBEB] p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          report.status === 'pending' ? 'bg-[#FF9800]/10 text-[#FF9800]' :
                          report.status === 'reviewing' ? 'bg-[#2196F3]/10 text-[#2196F3]' :
                          report.status === 'resolved' ? 'bg-[#00C300]/10 text-[#00C300]' :
                          'bg-[#8D8D8D]/10 text-[#8D8D8D]'
                        }`}>
                          {report.status === 'pending' ? <AlertTriangle size={14} /> :
                           report.status === 'reviewing' ? <Eye size={14} /> :
                           report.status === 'resolved' ? <Check size={14} /> :
                           <X size={14} />}
                        </div>
                        <div>
                          <p className="text-[#111111] text-sm font-medium">{report.reason}</p>
                          <p className="text-[#8D8D8D] text-[10px]">
                            {report.createdAt.toLocaleDateString()} · {report.status}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        report.status === 'pending' ? 'bg-[#FF9800]/10 text-[#FF9800]' :
                        report.status === 'reviewing' ? 'bg-[#2196F3]/10 text-[#2196F3]' :
                        report.status === 'resolved' ? 'bg-[#00C300]/10 text-[#00C300]' :
                        'bg-[#8D8D8D]/10 text-[#8D8D8D]'
                      }`}>
                        {report.status}
                      </span>
                    </div>

                    <div className="space-y-2 mb-3">
                      <div className="flex gap-2 text-xs">
                        <span className="text-[#8D8D8D] w-16 shrink-0">Reporter</span>
                        <code className="text-[#111111] bg-[#F5F5F5] px-2 py-0.5 rounded">{report.reporterId}</code>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <span className="text-[#8D8D8D] w-16 shrink-0">Reported</span>
                        <code className="text-[#111111] bg-[#F5F5F5] px-2 py-0.5 rounded">{report.reportedId}</code>
                      </div>
                      {report.details && (
                        <div className="flex gap-2 text-xs">
                          <span className="text-[#8D8D8D] w-16 shrink-0">Details</span>
                          <p className="text-[#111111] flex-1">{report.details}</p>
                        </div>
                      )}
                      {report.actionTaken && (
                        <div className="flex gap-2 text-xs">
                          <span className="text-[#8D8D8D] w-16 shrink-0">Action</span>
                          <p className="text-[#00C300] flex-1">{report.actionTaken}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {report.status === 'pending' && (
                      <div className="flex gap-2 flex-wrap">
                        <button type="button" onClick={() => updateReportStatus(report.id, 'reviewing', 'Under review')}
                          disabled={processingReportId === report.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#2196F3]/10 text-[#2196F3] text-xs rounded-full font-medium active:bg-[#2196F3]/20 transition-colors disabled:opacity-50"
                        >
                          <Eye size={12} /> Review
                        </button>
                        <button type="button" onClick={() => updateReportStatus(report.id, 'resolved', 'User banned')}
                          disabled={processingReportId === report.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#FF3B30]/10 text-[#FF3B30] text-xs rounded-full font-medium active:bg-[#FF3B30]/20 transition-colors disabled:opacity-50"
                        >
                          <Ban size={12} /> Ban
                        </button>
                        <button type="button" onClick={() => updateReportStatus(report.id, 'dismissed', 'No action taken')}
                          disabled={processingReportId === report.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#F5F5F5] text-[#8D8D8D] text-xs rounded-full font-medium active:bg-[#EBEBEB] transition-colors disabled:opacity-50"
                        >
                          <X size={12} /> Dismiss
                        </button>
                      </div>
                    )}
                    {report.status === 'reviewing' && (
                      <div className="flex gap-2 flex-wrap">
                        <button type="button" onClick={() => updateReportStatus(report.id, 'resolved', 'Action taken')}
                          disabled={processingReportId === report.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#00C300]/10 text-[#00C300] text-xs rounded-full font-medium active:bg-[#00C300]/20 transition-colors disabled:opacity-50"
                        >
                          <Check size={12} /> Resolve
                        </button>
                        <button type="button" onClick={() => updateReportStatus(report.id, 'resolved', 'User banned')}
                          disabled={processingReportId === report.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#FF3B30]/10 text-[#FF3B30] text-xs rounded-full font-medium active:bg-[#FF3B30]/20 transition-colors disabled:opacity-50"
                        >
                          <Ban size={12} /> Ban
                        </button>
                        <button type="button" onClick={() => updateReportStatus(report.id, 'dismissed', 'No action taken')}
                          disabled={processingReportId === report.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#F5F5F5] text-[#8D8D8D] text-xs rounded-full font-medium active:bg-[#EBEBEB] transition-colors disabled:opacity-50"
                        >
                          <X size={12} /> Dismiss
                        </button>
                      </div>
                    )}
                    {report.status === 'resolved' && (
                      <div className="flex items-center gap-1 text-xs text-[#00C300]">
                        <UserCheck size={12} /> Resolved by {report.reviewedBy?.slice(0, 8) || 'admin'}...
                      </div>
                    )}
                    {report.status === 'dismissed' && (
                      <div className="flex items-center gap-1 text-xs text-[#8D8D8D]">
                        <X size={12} /> Dismissed by {report.reviewedBy?.slice(0, 8) || 'admin'}...
                      </div>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        )}

        {/* ================= USERS TAB ================= */}
        {activeTab === 'users' && (
          <motion.div
            key="users"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 pt-4 pb-3">
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search users..."
                    className="w-full bg-white border border-[#EBEBEB] rounded-xl pl-9 pr-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
                  />
                </div>
                <button type="button" className="p-2.5 bg-white border border-[#EBEBEB] rounded-xl text-[#8D8D8D]">
                  <Filter size={16} />
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                {(['all', 'verified', 'suspended', 'banned', 'admins'] as const).map((f) => (
                  <button type="button" key={f}
                    onClick={() => setUserFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      userFilter === f ? 'bg-[#00C300] text-white' : 'bg-white border border-[#EBEBEB] text-[#8D8D8D]'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 pb-20 space-y-3">
              {usersLoading ? (
                <div className="flex justify-center py-12">
                  <Loader size={24} className="text-[#00C300] animate-spin" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-12">
                  <Users size={40} className="text-[#EBEBEB] mx-auto mb-3" />
                  <p className="text-[#8D8D8D] text-sm font-medium">No users found</p>
                  <p className="text-[#C7C7CC] text-xs mt-1">Try a different search or filter.</p>
                </div>
              ) : (
                filteredUsers.map((u, i) => {
                  const status = getUserStatus(u);
                  return (
                    <motion.div
                      key={u.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="bg-white rounded-xl border border-[#EBEBEB] p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0 overflow-hidden">
                          {u.avatar ? (
                            <img src={u.avatar} alt="User avatar" className="w-full h-full object-cover" />
                          ) : (
                            <Users size={18} className="text-[#8D8D8D]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-[#111111] text-sm font-medium truncate">{u.name}</p>
                            {u.verified && <Check size={12} className="text-[#00C300]" />}
                            {u.isAdmin && <Crown size={12} className="text-[#FF9800]" />}
                          </div>
                          <p className="text-[#8D8D8D] text-xs truncate">{u.email || u.phone || u.id.slice(0, 12)}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              status === 'admin' ? 'bg-[#FF9800]/10 text-[#FF9800]' :
                              status === 'verified' ? 'bg-[#00C300]/10 text-[#00C300]' :
                              status === 'suspended' ? 'bg-[#FF9800]/10 text-[#FF9800]' :
                              status === 'banned' ? 'bg-[#FF3B30]/10 text-[#FF3B30]' :
                              'bg-[#F5F5F5] text-[#8D8D8D]'
                            }`}>
                              {status}
                            </span>
                            <span className="text-[#C7C7CC] text-[10px]">
                              Joined {u.createdAt ? u.createdAt.toLocaleDateString() : 'Unknown'}
                            </span>
                          </div>
                        </div>
                        {processingUserId === u.id ? (
                          <Loader size={16} className="text-[#00C300] animate-spin shrink-0" />
                        ) : (
                          <div className="flex flex-col gap-1.5 shrink-0">
                            {!u.verified && status !== 'banned' && status !== 'suspended' && (
                              <button type="button" onClick={() => updateUserStatus(u, { verified: true }, 'verified')}
                                className="p-1.5 rounded-lg bg-[#00C300]/10 text-[#00C300] hover:bg-[#00C300]/20 transition-colors"
                                title="Verify"
                              >
                                <UserCheck size={14} />
                              </button>
                            )}
                            {status !== 'suspended' && status !== 'banned' && !u.isAdmin && (
                              <button type="button" onClick={() => updateUserStatus(u, { status: 'suspended' }, 'suspended')}
                                className="p-1.5 rounded-lg bg-[#FF9800]/10 text-[#FF9800] hover:bg-[#FF9800]/20 transition-colors"
                                title="Suspend"
                              >
                                <UserX size={14} />
                              </button>
                            )}
                            {status !== 'banned' && !u.isAdmin && (
                              <button type="button" onClick={() => updateUserStatus(u, { status: 'banned' }, 'banned')}
                                className="p-1.5 rounded-lg bg-[#FF3B30]/10 text-[#FF3B30] hover:bg-[#FF3B30]/20 transition-colors"
                                title="Ban"
                              >
                                <Ban size={14} />
                              </button>
                            )}
                            {(status === 'suspended' || status === 'banned') && (
                              <button type="button" onClick={() => updateUserStatus(u, { status: 'active' }, 'reactivated')}
                                className="p-1.5 rounded-lg bg-[#00C300]/10 text-[#00C300] hover:bg-[#00C300]/20 transition-colors"
                                title="Reactivate"
                              >
                                <UserPlus size={14} />
                              </button>
                            )}
                            {!u.isAdmin && status !== 'banned' && (
                              <button type="button" onClick={() => updateUserStatus(u, { isAdmin: true }, 'made admin')}
                                className="p-1.5 rounded-lg bg-[#2196F3]/10 text-[#2196F3] hover:bg-[#2196F3]/20 transition-colors"
                                title="Make Admin"
                              >
                                <Crown size={14} />
                              </button>
                            )}
                            {u.isAdmin && (
                              <button type="button" onClick={() => updateUserStatus(u, { isAdmin: false }, 'removed admin')}
                                className="p-1.5 rounded-lg bg-[#8D8D8D]/10 text-[#8D8D8D] hover:bg-[#8D8D8D]/20 transition-colors"
                                title="Remove Admin"
                              >
                                <Shield size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}

        {/* ================= CONTENT TAB ================= */}
        {activeTab === 'content' && (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 pt-4 pb-3">
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
                  <input
                    value={contentSearch}
                    onChange={(e) => setContentSearch(e.target.value)}
                    placeholder="Search posts..."
                    className="w-full bg-white border border-[#EBEBEB] rounded-xl pl-9 pr-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
                  />
                </div>
              </div>
            </div>

            <div className="px-4 pb-4">
              <p className="text-[#111111] text-sm font-bold mb-2">Recent Posts</p>
              {contentLoading ? (
                <div className="flex justify-center py-12">
                  <Loader size={24} className="text-[#00C300] animate-spin" />
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="text-center py-8">
                  <FileText size={32} className="text-[#EBEBEB] mx-auto mb-2" />
                  <p className="text-[#8D8D8D] text-sm font-medium">No posts found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredPosts.map((post, i) => (
                    <motion.div
                      key={post.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="bg-white rounded-xl border border-[#EBEBEB] p-4"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-9 h-9 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0 overflow-hidden">
                          {post.userAvatar ? (
                            <img src={post.userAvatar} alt="User avatar" className="w-full h-full object-cover" />
                          ) : (
                            <Users size={16} className="text-[#8D8D8D]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[#111111] text-sm font-medium">{post.userName || 'Unknown'}</p>
                          <p className="text-[#8D8D8D] text-[10px]">
                            {post.timestamp.toLocaleDateString()} · {post.visibility}
                          </p>
                        </div>
                        {processingPostId === post.id ? (
                          <Loader size={16} className="text-[#00C300] animate-spin shrink-0" />
                        ) : (
                          <div className="flex gap-1.5 shrink-0">
                            <button type="button" onClick={() => hidePost(post)}
                              className="p-1.5 rounded-lg bg-[#FF9800]/10 text-[#FF9800] hover:bg-[#FF9800]/20 transition-colors"
                              title="Hide"
                            >
                              <Eye size={14} />
                            </button>
                            <button type="button" onClick={() => deletePost(post.id)}
                              className="p-1.5 rounded-lg bg-[#FF3B30]/10 text-[#FF3B30] hover:bg-[#FF3B30]/20 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-[#111111] text-sm mb-3 line-clamp-3">{post.content}</p>
                      {post.images.length > 0 && (
                        <div className="grid grid-cols-3 gap-1 mb-3">
                          {post.images.slice(0, 3).map((img, idx) => (
                            <div key={idx} className="aspect-square rounded-lg bg-[#F5F5F5] overflow-hidden">
                              <img src={img} alt="Cover image" className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-xs text-[#8D8D8D]">
                        <span className="flex items-center gap-1">
                          <Heart size={12} /> {post.likes.length}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare size={12} /> {post.comments.length}
                        </span>
                        <span className="flex items-center gap-1">
                          <Flag size={12} /> 0
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Reported Comments */}
            <div className="px-4 pb-20">
              <p className="text-[#111111] text-sm font-bold mb-2">Reported Comments</p>
              {contentLoading ? (
                <div className="flex justify-center py-8">
                  <Loader size={24} className="text-[#00C300] animate-spin" />
                </div>
              ) : reportedComments.length === 0 ? (
                <div className="text-center py-8">
                  <MessageCircle size={32} className="text-[#EBEBEB] mx-auto mb-2" />
                  <p className="text-[#8D8D8D] text-sm font-medium">No reported comments</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reportedComments.map((c, i) => (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="bg-white rounded-xl border border-[#EBEBEB] p-4"
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <div className="w-7 h-7 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0">
                          <Users size={12} className="text-[#8D8D8D]" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[#111111] text-xs font-medium">{c.userId.slice(0, 16)}</p>
                          <p className="text-[#8D8D8D] text-[10px]">{c.timestamp.toLocaleDateString()}</p>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF3B30]/10 text-[#FF3B30] font-medium">
                          {c.reports} reports
                        </span>
                      </div>
                      <p className="text-[#111111] text-sm bg-[#F5F5F5] rounded-lg p-2 mb-2">{c.content}</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => toast.success('Comment dismissed')}
                          className="px-3 py-1.5 bg-[#F5F5F5] text-[#8D8D8D] text-xs rounded-full font-medium"
                        >
                          Dismiss
                        </button>
                        <button type="button" onClick={() => toast.success('Comment removed')}
                          className="px-3 py-1.5 bg-[#FF3B30]/10 text-[#FF3B30] text-xs rounded-full font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ================= ANALYTICS TAB ================= */}
        {activeTab === 'analytics' && (
          <motion.div
            key="analytics"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 pt-4 pb-20">
              {analyticsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader size={24} className="text-[#00C300] animate-spin" />
                </div>
              ) : !stats ? (
                <div className="text-center py-12">
                  <BarChart3 size={40} className="text-[#EBEBEB] mx-auto mb-3" />
                  <p className="text-[#8D8D8D] text-sm font-medium">No analytics data</p>
                </div>
              ) : (
                <>
                  {/* Stat Cards */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {[
                      { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-[#00C300]' },
                      { label: 'DAU Today', value: stats.dailyActiveUsers, icon: Activity, color: 'text-[#2196F3]' },
                      { label: 'Total Posts', value: stats.totalPosts, icon: FileText, color: 'text-[#FF9800]' },
                      { label: 'Total Messages', value: stats.totalMessages, icon: MessageCircle, color: 'text-[#8D8D8D]' },
                      { label: 'New Users Today', value: stats.newUsersToday, icon: TrendingUp, color: 'text-[#00C300]' },
                      { label: 'Pending Reports', value: stats.pendingReports, icon: Flag, color: 'text-[#FF3B30]' },
                    ].map((s, i) => {
                      const Icon = s.icon;
                      return (
                        <motion.div
                          key={s.label}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                          className="bg-white rounded-xl border border-[#EBEBEB] p-3"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-7 h-7 rounded-lg bg-[#F5F5F5] flex items-center justify-center ${s.color}`}>
                              <Icon size={14} />
                            </div>
                            <p className="text-[#8D8D8D] text-[10px] font-medium">{s.label}</p>
                          </div>
                          <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Engagement Rate */}
                  <div className="bg-white rounded-xl border border-[#EBEBEB] p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MousePointerClick size={14} className="text-[#00C300]" />
                      <p className="text-[#111111] text-sm font-bold">Engagement Rate</p>
                    </div>
                    <div className="flex items-end gap-2">
                      <p className="text-3xl font-bold text-[#111111]">
                        {stats.totalUsers > 0
                          ? `${Math.round((stats.dailyActiveUsers / stats.totalUsers) * 100)}%`
                          : '0%'}
                      </p>
                      <p className="text-[#8D8D8D] text-xs mb-1">DAU / Total Users</p>
                    </div>
                    <div className="w-full h-2 bg-[#F5F5F5] rounded-full mt-3 overflow-hidden">
                      <div
                        className="h-full bg-[#00C300] rounded-full transition-all"
                        style={{
                          width: `${stats.totalUsers > 0 ? Math.min((stats.dailyActiveUsers / stats.totalUsers) * 100, 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* User Growth Chart */}
                  <div className="bg-white rounded-xl border border-[#EBEBEB] p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <TrendingUp size={14} className="text-[#00C300]" />
                        <p className="text-[#111111] text-sm font-bold">User Growth</p>
                      </div>
                      <span className="text-[#8D8D8D] text-[10px]">Last 7 days</span>
                    </div>
                    {userGrowth.length === 0 ? (
                      <p className="text-[#8D8D8D] text-xs text-center py-4">No data</p>
                    ) : (
                      <div className="space-y-2">
                        {userGrowth.map((d) => (
                          <div key={d.day} className="flex items-center gap-2">
                            <span className="text-[#8D8D8D] text-[10px] w-8 shrink-0">{d.day}</span>
                            <div className="flex-1 h-6 bg-[#F5F5F5] rounded-md overflow-hidden relative">
                              <div
                                className="h-full bg-[#00C300]/20 rounded-md transition-all"
                                style={{ width: `${Math.round((d.count / maxUserGrowth) * 100)}%` }}
                              />
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#111111] text-[10px] font-medium">
                                {d.count}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Post Activity Chart */}
                  <div className="bg-white rounded-xl border border-[#EBEBEB] p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-[#FF9800]" />
                        <p className="text-[#111111] text-sm font-bold">Post Activity</p>
                      </div>
                      <span className="text-[#8D8D8D] text-[10px]">Last 7 days</span>
                    </div>
                    {postActivity.length === 0 ? (
                      <p className="text-[#8D8D8D] text-xs text-center py-4">No data</p>
                    ) : (
                      <div className="space-y-2">
                        {postActivity.map((d) => (
                          <div key={d.day} className="flex items-center gap-2">
                            <span className="text-[#8D8D8D] text-[10px] w-8 shrink-0">{d.day}</span>
                            <div className="flex-1 h-6 bg-[#F5F5F5] rounded-md overflow-hidden relative">
                              <div
                                className="h-full bg-[#FF9800]/20 rounded-md transition-all"
                                style={{ width: `${Math.round((d.count / maxPostActivity) * 100)}%` }}
                              />
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#111111] text-[10px] font-medium">
                                {d.count}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quick Links */}
                  <div className="bg-white rounded-xl border border-[#EBEBEB] p-4">
                    <p className="text-[#111111] text-sm font-bold mb-3">Quick Actions</p>
                    <div className="space-y-2">
                      <button type="button" onClick={() => setActiveTab('reports')}
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-[#F5F5F5] hover:bg-[#EBEBEB] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Flag size={14} className="text-[#FF3B30]" />
                          <span className="text-[#111111] text-sm">Review Pending Reports</span>
                        </div>
                        <ChevronRight size={14} className="text-[#8D8D8D]" />
                      </button>
                      <button type="button" onClick={() => setActiveTab('users')}
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-[#F5F5F5] hover:bg-[#EBEBEB] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Users size={14} className="text-[#00C300]" />
                          <span className="text-[#111111] text-sm">Manage Users</span>
                        </div>
                        <ChevronRight size={14} className="text-[#8D8D8D]" />
                      </button>
                      <button type="button" onClick={() => setActiveTab('content')}
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-[#F5F5F5] hover:bg-[#EBEBEB] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-[#FF9800]" />
                          <span className="text-[#111111] text-sm">Moderate Content</span>
                        </div>
                        <ChevronRight size={14} className="text-[#8D8D8D]" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
