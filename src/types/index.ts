export interface User {
  id: string;
  name: string;
  displayName?: string;
  username?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  coverImage?: string;
  status?: string;
  statusMessage?: string;
  lastSeen?: Date | null;
  coins?: number;
  usdBalance?: number;
  bdtBalance?: number; // for backwards compatibility
  savedPosts?: string[];
  blockedUsers?: string[];
  favorites?: string[];
  friends?: string[];
  verified?: boolean;
  bio?: string;
  location?: string;
  website?: string;
  createdAt?: Date;
  interests?: string[];
  friendCount?: number;
  latitude?: number;
  longitude?: number;
  friendRequestPrivacy?: 'everyone' | 'friends_of_friends' | 'nobody';
  hideFriendList?: boolean;
  hideOnlineStatus?: boolean;
  isAdmin?: boolean;
  isPremium?: boolean;
  premiumExpiresAt?: Date;
  referredBy?: string;
  referralCode?: string;
  referralCount?: number;
  streakDays?: number;
  lastStreakDate?: Date;
  achievements?: string[];
  followers?: string[];
  following?: string[];
  closeFriends?: string[];
  groupAddPrivacy?: 'everyone' | 'friends_of_friends' | 'nobody';
  disappearingMessagesDefault?: number; // seconds, 0 = off
  chatLocks?: Record<string, boolean>; // chatId -> locked
  chatLockPins?: Record<string, string>; // chatId -> PIN hash
  broadcastLists?: string[]; // broadcast list IDs
  contactsOnlyInApp?: string[]; // contact IDs not saved to phonebook
}


export interface Chat {
  id: string;
  type: 'direct' | 'group';
  participants: string[];
  name?: string;
  avatar?: string;
  lastMessage?: string | Message;
  lastMessageSenderId?: string;
  lastMessageRead?: boolean;
  updatedAt?: string | Date;
  unreadCount?: number;
  isMuted?: boolean;
  admins?: string[];
  createdBy?: string;
  archived?: boolean;
  pinned?: boolean;
  pinnedMessages?: PinnedMessage[];
  description?: string;
  disappearingMessages?: number; // seconds, 0 = off
  chatLocked?: boolean;
  lockType?: 'pin' | 'biometric';
  lockValue?: string; // hashed PIN or biometric reference
}

export type MessageType = 'text' | 'image' | 'video' | 'voice' | 'file' | 'sticker' | 'poll' | 'system' | 'money_transfer' | 'location' | 'deleted' | 'contact_card' | 'broadcast';

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: MessageType;
  mediaUrl?: string;
  timestamp: Date;
  read?: boolean;
  edited?: boolean;
  replyTo?: string;
  reaction?: string;
  reactions?: Record<string, string[]>;
  forwardedFrom?: string;
  pollData?: PollData;
  transferData?: TransferData;
  contactCard?: ContactCardData;
  disappearingTimer?: number; // seconds until self-destruct, 0 = permanent
  disappearingInitiatedAt?: Date;
  destroyed?: boolean;
  deliveryStatus?: 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  deliveredAt?: Date;
  readAt?: Date;
  retryCount?: number;
  localId?: string; // client-generated ID for tracking sends
}

export interface ContactCardData {
  userId: string;
  name: string;
  phone?: string;
  email?: string;
  avatar?: string;
  username?: string;
  bio?: string;
}

export interface BroadcastList {
  id: string;
  userId: string;
  name: string;
  recipientIds: string[];
  createdAt: Date;
}


export interface TransferData {
  amount: number;
  currency: 'coins' | 'USD' | 'BDT' | 'RMB' | 'INR'; // BDT for backwards compatibility
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'completed' | 'failed';
  note?: string;
}

export interface PollOption {
  text: string;
  votes: string[];
}

export interface PollData {
  question: string;
  options: PollOption[];
  votes?: Record<string, string[]>;
  totalVotes: number;
}

export interface TimelinePost {
  id: string;
  userId: string;
  content: string;
  images: string[];
  imageCaptions?: string[];
  likes: string[];
  comments: PostComment[];
  shares: string[];
  timestamp: Date;
  visibility: 'public' | 'friends' | 'private' | 'followers' | 'groups' | 'custom' | 'close_friends';
  liked?: boolean;
  pollData?: PostPollData;
  userName?: string;
  userAvatar?: string;
  videoUrl?: string;
  location?: string;
  lat?: number;
  lng?: number;
  hashtags?: string[];
  mentions?: string[];
  contentWarning?: string;
  linkPreview?: LinkPreviewData;
  reactions?: PostReactions;
  savedBy?: string[];
  repostedBy?: string[];
  originalPostId?: string;
  edited?: boolean;
  editedAt?: Date;
  pinned?: boolean;
  commentCount?: number;
  shareCount?: number;
  viewCount?: number;
  reachCount?: number;
  impressionCount?: number;
  mediaType?: 'text' | 'photo' | 'video' | 'audio' | 'gif' | 'carousel' | 'poll' | 'event' | 'reel' | 'story' | 'live' | 'blog' | 'marketplace';
  eventData?: EventData;
}

export interface PostReactions {
  like: string[];
  love: string[];
  haha: string[];
  wow: string[];
  sad: string[];
  angry: string[];
  clap: string[];
  fire: string[];
}

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  image?: string;
  domain?: string;
}

export interface PostPollData {
  question: string;
  options: PollOption[];
  totalVotes: number;
  endDate?: Date;
}

export interface PostComment {
  id: string;
  userId: string;
  content: string;
  timestamp: Date;
  likes: string[];
  replies?: PostComment[];
  userName?: string;
  userAvatar?: string;
  reactions?: Record<string, string[]>;
  pinned?: boolean;
  imageUrl?: string;
  voiceUrl?: string;
  gifUrl?: string;
}

export interface FriendRequest {
  id: string;
  from: string;
  to: string;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: Date;
  fromUser?: User | null;
}

export type FriendStatus = 'not_friends' | 'request_sent' | 'request_received' | 'friends' | 'blocked' | 'self';

export interface SuggestedUser extends User {
  mutualCount: number;
  score: number;
  distance?: number;
}

export interface SentRequest {
  id: string;
  toUserId: string;
  toUser?: User;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: Date;
}

export interface BlockedUserRecord {
  id: string;
  blockerId: string;
  blockedId: string;
  blockedUser?: User;
  reason?: string;
  createdAt: Date;
}

export interface UserReport {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: string;
  details?: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  reviewedBy?: string;
  reviewedAt?: Date;
  actionTaken?: string;
  createdAt: Date;
  contentId?: string;
  contentType?: 'post' | 'comment' | 'user' | 'message' | 'group' | 'story' | 'reel';
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface PrivacySettings {
  userId: string;
  whoCanSendRequests: 'everyone' | 'friends_of_friends' | 'nobody';
  hideFriendList: boolean;
  hideOnlineStatus: boolean;
  hideLastSeen: boolean;
  hideProfilePhoto: boolean;
  allowSearchByPhone: boolean;
  allowSearchByEmail: boolean;
  postDefaultVisibility: 'public' | 'friends' | 'followers' | 'private' | 'close_friends';
  allowMentions: 'everyone' | 'friends' | 'nobody';
  allowStoryReplies: 'everyone' | 'friends' | 'nobody';
  ageRestricted?: boolean;
}

export interface CallRecord {
  id: string;
  initiatorId: string;
  participantIds: string[];
  type: 'voice' | 'video' | 'group_voice' | 'group_video';
  status: 'connected' | 'ended' | 'rejected' | 'missed' | 'calling';
  timestamp: Date;
  duration?: number;
  deletedBy?: string[];
}

export interface WalletTransaction {
  id: string;
  type: 'earn' | 'spend' | 'send' | 'receive' | 'withdraw' | 'deposit' | 'convert' | 'premium' | 'subscription' | 'tip' | 'ad_revenue' | 'referral_bonus' | 'streak_bonus' | 'achievement' | 'refund';
  amount: number;
  currency: 'coins' | 'USD' | 'BDT' | 'RMB' | 'INR'; // BDT for backwards compatibility
  description: string;
  timestamp: string | Date;
  status?: 'pending' | 'completed' | 'failed';
}

export interface WalletData {
  coins: number;
  usdBalance: number;
  usd_balance?: number;
  bdtBalance?: number; // for backwards compatibility
  transactions: WalletTransaction[];
}

export interface WithdrawalRequest {
  id: string;
  amount: number;
  currency: 'coins' | 'USD' | 'BDT' | 'RMB' | 'INR'; // BDT for backwards compatibility
  method: string;
  account: string;
  status: 'pending' | 'completed' | 'rejected';
  createdAt: Date;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'message' | 'call' | 'reaction' | 'mention' | 'group_invite' | 'friend_request' | 'money_received' | 'group_call' | 'post_like' | 'comment' | 'friend_removed' | 'blocked_interaction' | 'story_view' | 'live_start' | 'follow' | 'repost' | 'tip' | 'premium_expiry' | 'achievement' | 'streak' | 'nearby_post' | 'trending' | 'tagged';
  title: string;
  body: string;
  read: boolean;
  data?: { chatId?: string; postId?: string; userId?: string; groupId?: string; requestId?: string; fromUserId?: string; storyId?: string; reelId?: string; liveId?: string; amount?: number; currency?: string; achievementId?: string };
  timestamp: Date;
}

export interface PinnedMessage {
  message_id: string;
  content: string;
  pinned_by: string;
  pinned_at: string;
  // camelCase aliases written by older store versions — normalized on read
  messageId?: string;
  pinnedBy?: string;
  pinnedAt?: string;
}

export interface ThemeSettings {
  theme: 'light' | 'dark' | 'midnight' | 'oled' | 'gaga';
  fontSize: 'small' | 'medium' | 'large';
  language: 'en' | 'bn' | 'es' | 'fr' | 'ar' | 'zh';
  accentColor: string;
  notifications: {
    pushEnabled: boolean;
    messageSound: boolean;
    callSound: boolean;
    groupSound: boolean;
    showPreview: boolean;
    mentions: boolean;
    reactions: boolean;
    storyReplies: boolean;
    liveAlerts: boolean;
    marketplaceAlerts: boolean;
    emailNotifications: boolean;
    quietHours: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    soundProfile: 'gaga' | 'classic' | 'minimal' | 'playful';
    vibrationEnabled: boolean;
  };
  privacy: {
    lastSeen: 'everyone' | 'friends' | 'nobody';
    onlineStatus: 'everyone' | 'friends' | 'nobody';
    readReceipts: boolean;
    profileVisibility: 'everyone' | 'friends' | 'nobody';
    showOnlineStatus: boolean;
    whoCanSendRequests: 'everyone' | 'friends_of_friends' | 'nobody';
    whoCanMention: 'everyone' | 'friends' | 'nobody';
    whoCanComment: 'everyone' | 'friends' | 'nobody';
    groupAddPrivacy: 'everyone' | 'friends_of_friends' | 'nobody';
    allowScreenshot: boolean;
    storyPrivacy?: 'everyone' | 'friends' | 'close_friends';
    callPrivacy?: 'everyone' | 'friends' | 'nobody';
    profilePhotoPrivacy?: 'everyone' | 'friends' | 'nobody';
  };
  data: {
    autoDownloadMedia: boolean;
    mediaQuality: 'auto' | 'high' | 'medium' | 'low';
    dataSaver: boolean;
    autoPlayVideos: boolean;
    autoPlayReels: boolean;
  };
  accessibility: {
    reducedMotion: boolean;
    highContrast: boolean;
    hapticFeedback: boolean;
    enterToSend: boolean;
  };
  security: {
    biometricLock: boolean;
    screenLockTimeout: number;
    showSecurityAlerts: boolean;
  };
}

export interface GroupData {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  participants: string[];
  admins: string[];
  createdBy: string;
  createdAt: Date;
  settings?: {
    onlyAdminsCanPost?: boolean;
    onlyAdminsCanAdd?: boolean;
    isPublic?: boolean;
  };
  coverImage?: string;
  rules?: string[];
  pinnedPosts?: string[];
  memberCount?: number;
  pendingRequests?: string[];
}

export interface PhoneAuthSession {
  phone: string;
  otp: string;
  expiresAt: number;
  verified: boolean;
}

export interface Story {
  id: string;
  userId: string;
  mediaUrl: string;
  type: 'image' | 'video';
  timestamp: Date;
  viewedBy: string[];
  userName?: string;
  userAvatar?: string;
  musicUrl?: string;
  stickers?: StorySticker[];
  pollData?: StoryPollData;
  questionData?: StoryQuestionData;
  countdownData?: StoryCountdownData;
  mentions?: string[];
  linkUrl?: string;
  reactions?: Record<string, string[]>;
  highlightId?: string;
  highlightTitle?: string;
  expiresAt: Date;
}

export interface StorySticker {
  type: 'text' | 'emoji' | 'poll' | 'question' | 'countdown' | 'mention' | 'location' | 'hashtag' | 'link';
  content: string;
  position: { x: number; y: number };
  rotation?: number;
  scale?: number;
  color?: string;
  style?: 'classic' | 'typewriter' | 'strong' | 'neon';
}

export interface StoryPollData {
  question: string;
  options: [string, string];
  votes: Record<string, number>;
  votedBy: string[];
}

export interface StoryQuestionData {
  question: string;
  responses: { userId: string; response: string; timestamp: Date }[];
}

export interface StoryCountdownData {
  title: string;
  targetDate: Date;
}

export interface StoryHighlight {
  id: string;
  userId: string;
  title: string;
  coverImage: string;
  storyIds: string[];
  createdAt: Date;
}

export interface Reel {
  id: string;
  userId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  caption: string;
  musicTitle?: string;
  musicUrl?: string;
  filters?: string[];
  filter?: string;
  effects?: string[];
  speed?: number;
  voiceover?: string;
  captions?: string;
  duration: number;
  likes: string[];
  comments: PostComment[];
  shares: string[];
  savedBy: string[];
  viewedBy: string[];
  timestamp: Date;
  userName?: string;
  userAvatar?: string;
  tags?: string[];
  mentions?: string[];
  remixOf?: string;
  duetWith?: string;
  template?: string;
  viewCount: number;
  reactions?: PostReactions;
  category?: string;
}

export interface LiveStream {
  id: string;
  userId: string;
  title: string;
  thumbnailUrl?: string;
  isLive: boolean;
  startedAt: Date;
  endedAt?: Date;
  viewers: string[];
  viewerCount: number;
  peakViewers: number;
  comments: LiveComment[];
  reactions: LiveReactions;
  gifts: LiveGift[];
  pinnedComment?: string;
  mutedViewers: string[];
  replayUrl?: string;
  replayAvailable: boolean;
  userName?: string;
  userAvatar?: string;
  isScreenSharing?: boolean;
  multiGuestIds?: string[];
  category?: string;
  hashtags?: string[];
}

export interface LiveComment {
  id: string;
  userId: string;
  content: string;
  timestamp: Date;
  userName?: string;
  isPinned?: boolean;
  isModerator?: boolean;
}

export interface LiveReactions {
  like: number;
  love: number;
  haha: number;
  wow: number;
  fire: number;
  clap: number;
}

export interface LiveGift {
  id: string;
  userId: string;
  type: 'rose' | 'heart' | 'star' | 'crown' | 'diamond' | 'rocket';
  amount: number;
  currency: 'coins' | 'USD' | 'BDT' | 'RMB' | 'INR'; // BDT for backwards compatibility
  timestamp: Date;
  userName?: string;
  message?: string;
}

export interface EventData {
  id: string;
  userId: string;
  title: string;
  description: string;
  location: string;
  lat?: number;
  lng?: number;
  startDate: Date;
  endDate: Date;
  coverImage?: string;
  attendees: string[];
  maybes: string[];
  notGoing: string[];
  invited: string[];
  privacy: 'public' | 'friends' | 'private';
  cost?: number;
  currency?: 'USD' | 'BDT';
  isOnline: boolean;
  onlineLink?: string;
  category?: string;
  capacity?: number;
  createdAt: Date;
  userName?: string;
  userAvatar?: string;
}

export interface MarketplaceItem {
  id: string;
  userId: string;
  title: string;
  description: string;
  price: number;
  currency: 'USD' | 'BDT';
  images: string[];
  category: string;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
  location: string;
  lat?: number;
  lng?: number;
  isNegotiable: boolean;
  status: 'active' | 'sold' | 'reserved' | 'deleted';
  favorites: string[];
  views: number;
  createdAt: Date;
  userName?: string;
  userAvatar?: string;
  offers?: MarketplaceOffer[];
  chatRequests?: string[];
  tags?: string[];
}

export interface MarketplaceOffer {
  id: string;
  userId: string;
  amount: number;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: Date;
  userName?: string;
}

export interface Hashtag {
  id: string;
  tag: string;
  postCount: number;
  followers: string[];
  trending: boolean;
  trendRank?: number;
  relatedTags?: string[];
  description?: string;
}

export interface Bookmark {
  id: string;
  userId: string;
  postId: string;
  collectionId?: string;
  timestamp: Date;
  post?: TimelinePost;
}

export interface BookmarkCollection {
  id: string;
  userId: string;
  name: string;
  description?: string;
  coverImage?: string;
  isPrivate: boolean;
  count: number;
  createdAt: Date;
}

export interface PremiumPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: 'USD' | 'coins' | 'BDT' | 'RMB' | 'INR'; // BDT for backwards compatibility
  duration: 'monthly' | 'quarterly' | 'yearly' | 'lifetime';
  features: string[];
  badge: string;
  color: string;
  popular?: boolean;
}

export interface PremiumSubscription {
  id: string;
  userId: string;
  planId: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  startedAt: Date;
  expiresAt: Date;
  autoRenew: boolean;
  price: number;
  currency: 'USD' | 'coins' | 'BDT' | 'RMB' | 'INR'; // BDT for backwards compatibility
  plan?: PremiumPlan;
}

export interface ReferralRecord {
  id: string;
  referrerId: string;
  referredId: string;
  status: 'pending' | 'completed' | 'rewarded';
  rewardAmount: number;
  currency: 'coins' | 'USD' | 'BDT' | 'RMB' | 'INR'; // BDT for backwards compatibility
  timestamp: Date;
  referredUser?: User;
}

export interface AdSlot {
  id: string;
  type: 'feed' | 'story' | 'banner' | 'interstitial' | 'native';
  title: string;
  description: string;
  imageUrl?: string;
  videoUrl?: string;
  linkUrl: string;
  advertiser: string;
  targetAudience?: string[];
  startDate: Date;
  endDate: Date;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  status: 'active' | 'paused' | 'completed' | 'pending';
  priority: number;
}

export interface CreatorSubscription {
  id: string;
  creatorId: string;
  subscriberId: string;
  price: number;
  currency: 'USD' | 'coins' | 'BDT' | 'RMB' | 'INR'; // BDT for backwards compatibility
  tier: 'basic' | 'standard' | 'premium';
  status: 'active' | 'cancelled' | 'expired';
  startedAt: Date;
  expiresAt: Date;
  creator?: User;
  subscriber?: User;
}

export interface TipRecord {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: 'coins' | 'USD' | 'BDT' | 'RMB' | 'INR'; // BDT for backwards compatibility
  message: string;
  contentId?: string;
  contentType?: 'post' | 'reel' | 'live' | 'story';
  timestamp: Date;
  fromUserName?: string;
  toUserName?: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'social' | 'engagement' | 'content' | 'premium' | 'streak' | 'referral' | 'monetization' | 'admin';
  requirement: number;
  reward: number;
  rewardCurrency: 'coins' | 'USD' | 'BDT' | 'RMB' | 'INR'; // BDT for backwards compatibility
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  unlockedAt?: Date;
  progress?: number;
}

export interface StreakData {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: Date;
  streakHistory: { date: string; active: boolean }[];
  nextMilestone: number;
  rewardPending: number;
}

export interface PostAnalytics {
  postId: string;
  views: number;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reactions: PostReactions;
  audienceDemographics: AudienceDemographics;
  watchTime?: number;
  engagementRate: number;
  topReferrers: string[];
  peakHour: number;
  dateRange: { from: Date; to: Date };
}

export interface AudienceDemographics {
  ageRanges: Record<string, number>;
  genders: Record<string, number>;
  countries: Record<string, number>;
  cities: Record<string, number>;
  devices: Record<string, number>;
}

export interface CreatorAnalytics {
  userId: string;
  totalFollowers: number;
  followersGained: number;
  followersLost: number;
  totalPosts: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  engagementRate: number;
  topPosts: string[];
  dailyActiveAudience: number;
  watchTime: number;
  revenue: number;
  revenueCurrency: 'USD' | 'BDT'; // BDT for backwards compatibility
  tipsReceived: number;
  subscriptionsCount: number;
  growthChart: { date: string; followers: number; views: number }[];
}

export interface AdminDashboardStats {
  totalUsers: number;
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  newUsersToday: number;
  totalPosts: number;
  totalMessages: number;
  totalCalls: number;
  totalTransactions: number;
  revenue: number;
  premiumUsers: number;
  reportedContent: number;
  pendingReports: number;
  bannedUsers: number;
  activeAds: number;
  totalTips: number;
  totalReferrals: number;
  topHashtags: string[];
  serverUptime: number;
  growthRate: number;
}

export interface SavedPostRecord {
  id: string;
  userId: string;
  postId: string;
  collectionId?: string;
  timestamp: Date;
  post?: TimelinePost;
}

export interface FeedFilter {
  type: 'all' | 'photos' | 'videos' | 'text' | 'polls' | 'reels' | 'stories' | 'live' | 'marketplace' | 'events';
  sortBy: 'newest' | 'oldest' | 'popular' | 'most_liked' | 'most_commented' | 'most_shared' | 'trending' | 'nearby' | 'recommended';
  timeRange?: 'today' | 'week' | 'month' | 'year' | 'all';
  location?: { lat: number; lng: number; radius: number };
  hashtags?: string[];
  fromUsers?: string[];
  excludeUsers?: string[];
  onlyFriends?: boolean;
  onlyFollowing?: boolean;
  onlyVerified?: boolean;
  onlyPremium?: boolean;
  includeReposts?: boolean;
  minLikes?: number;
  nsfw?: boolean;
  language?: string;
}

export interface QRProfileData {
  userId: string;
  username: string;
  name: string;
  avatar?: string;
  link: string;
}