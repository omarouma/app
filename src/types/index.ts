export interface User {
  id: string;
  name: string;
  displayName?: string;
  username?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  coverImage?: string;
  coverVideo?: string;
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
  // ── Business profile (optional) ──
  isBusiness?: boolean;
  businessName?: string;
  businessCategory?: string;
  businessDescription?: string;
  businessAddress?: string;
  businessHours?: string;
  businessWebsite?: string;
  businessEmail?: string;
  businessPhone?: string;
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
  inviteCode?: string;
  settings?: {
    onlyAdminsCanPost?: boolean;
    onlyAdminsCanAdd?: boolean;
    isPublic?: boolean;
  };
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
  /** Duration in seconds for voice/video messages (persisted so the UI never
   *  has to re-derive it from streaming metadata, which can be Infinity/NaN). */
  duration?: number;
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
  contentType?: 'user' | 'message' | 'group' | 'chat' | 'call';
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
  allowMentions: 'everyone' | 'friends' | 'nobody';
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



export interface TipRecord {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: 'coins' | 'USD' | 'BDT' | 'RMB' | 'INR'; // BDT for backwards compatibility
  message: string;
  contentId?: string;
  contentType?: 'chat' | 'call';
  timestamp: Date;
  fromUserName?: string;
  toUserName?: string;
}






export interface AdminDashboardStats {
  totalUsers: number;
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  newUsersToday: number;
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



export interface QRProfileData {
  userId: string;
  username: string;
  name: string;
  avatar?: string;
  link: string;
}