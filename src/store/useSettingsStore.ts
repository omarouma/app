import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  COLLECTIONS,
  getDocById,
  isFirestoreAvailable,
  setDocById,
} from '@/lib/firestore';
import type { ThemeSettings } from '@/types';

interface SettingsStore {
  settings: ThemeSettings;
  updateSettings: (partial: Partial<ThemeSettings>) => void;
  syncSettings: (userId: string) => Promise<void>;
}

const defaultSettings: ThemeSettings = {
  theme: 'gaga',
  fontSize: 'medium',
  language: 'en',
  accentColor: '#00C300',
  notifications: {
    pushEnabled: true,
    messageSound: true,
    callSound: true,
    groupSound: true,
    showPreview: true,
    mentions: true,
    reactions: true,
    storyReplies: true,
    liveAlerts: true,
    marketplaceAlerts: true,
    emailNotifications: false,
    quietHours: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    soundProfile: 'gaga' as const,
    vibrationEnabled: true,
  },
  privacy: {
    lastSeen: 'everyone',
    onlineStatus: 'everyone',
    readReceipts: true,
    profileVisibility: 'everyone',
    showOnlineStatus: true,
    whoCanSendRequests: 'everyone',
    whoCanMention: 'everyone',
    whoCanComment: 'everyone',
    groupAddPrivacy: 'everyone',
    allowScreenshot: true,
  },
  data: {
    autoDownloadMedia: true,
    mediaQuality: 'auto',
    dataSaver: false,
    autoPlayVideos: true,
    autoPlayReels: true,
  },
  accessibility: {
    reducedMotion: false,
    highContrast: false,
    hapticFeedback: true,
    enterToSend: true,
  },
  security: {
    biometricLock: false,
    screenLockTimeout: 5,
    showSecurityAlerts: true,
  },
};

// Deep merge helper
function mergeSettings(base: ThemeSettings, partial: Partial<ThemeSettings>): ThemeSettings {
  return {
    ...base,
    ...partial,
    notifications: { ...base.notifications, ...(partial.notifications || {}) },
    privacy: { ...base.privacy, ...(partial.privacy || {}) },
    data: { ...base.data, ...(partial.data || {}) },
    accessibility: { ...base.accessibility, ...(partial.accessibility || {}) },
    security: { ...base.security, ...(partial.security || {}) },
  };
}

export const useUserSettings = create<SettingsStore>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      updateSettings: async (partial) => {
        const newSettings = mergeSettings(get().settings, partial);
        set({ settings: newSettings });

        if (isFirestoreAvailable()) {
          try {
            // Dynamic import to avoid circular dependency with useAuthStore
            const { useAuthStore } = await import('@/store/useAuthStore');
            const userId = useAuthStore.getState().user?.id;
            if (userId) {
              const columnUpdates: Record<string, any> = { settings: newSettings };
              const privacy = newSettings.privacy as any;
              if (privacy?.whoCanSendRequests !== undefined) columnUpdates.friendRequestPrivacy = privacy.whoCanSendRequests;
              if (privacy?.hideFriendList !== undefined) columnUpdates.hideFriendList = privacy.hideFriendList;
              if (privacy?.hideOnlineStatus !== undefined) columnUpdates.hideOnlineStatus = privacy.hideOnlineStatus;
              await setDocById(COLLECTIONS.USERS, userId, columnUpdates);
            }
          } catch {
            // ignore sync errors
          }
        }
      },
      syncSettings: async (userId) => {
        if (!userId) return;
        try {
          const data = await getDocById(COLLECTIONS.USERS, userId);
          if (data?.settings) {
            const parsed = typeof data.settings === 'string' ? JSON.parse(data.settings) : data.settings;
            const privacyPatch: any = {};
            if (data.friendRequestPrivacy) privacyPatch.whoCanSendRequests = data.friendRequestPrivacy;
            if (data.hideFriendList !== null) privacyPatch.hideFriendList = data.hideFriendList;
            if (data.hideOnlineStatus !== null) privacyPatch.hideOnlineStatus = data.hideOnlineStatus;
            set({ settings: mergeSettings(defaultSettings, { ...parsed, privacy: { ...defaultSettings.privacy, ...parsed?.privacy, ...privacyPatch } }) });
          } else {
            // No stored settings yet, but may have column values
            const privacyPatch: any = {};
            if (data) {
              if (data.friendRequestPrivacy) privacyPatch.whoCanSendRequests = data.friendRequestPrivacy;
              if (data.hideFriendList !== null) privacyPatch.hideFriendList = data.hideFriendList;
              if (data.hideOnlineStatus !== null) privacyPatch.hideOnlineStatus = data.hideOnlineStatus;
            }
            if (Object.keys(privacyPatch).length > 0) {
              set({ settings: mergeSettings(defaultSettings, { privacy: privacyPatch }) });
            }
          }
        } catch {
          // ignore fetch errors
        }
      },
    }),
    {
      name: 'gaga-settings',
    }
  )
);

export const useSoundStore = create<{ playSound: (type: string) => void }>(() => ({
  playSound: (type: string) => {
    import('@/lib/sounds').then(({ safePlay, playMessageReceived, playNotification, vibrateMessageReceived, vibrateNotification }) => {
      if (type === 'MESSAGE_RECEIVED') safePlay(playMessageReceived, vibrateMessageReceived);
      else if (type === 'CALL_INCOMING') safePlay(playNotification, vibrateNotification);
    }).catch(() => {});
  },
}));
