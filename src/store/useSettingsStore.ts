/* eslint-disable @typescript-eslint/no-explicit-any */
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

        // Sync to Firestore if available
        if (isFirestoreAvailable()) {
          try {
            const userId = localStorage.getItem('gaga_current_user_id');
            if (userId) {
              const columnUpdates: Record<string, any> = { settings: newSettings };
              const privacy = newSettings.privacy as any;
              if (privacy?.whoCanSendRequests !== undefined) {
                columnUpdates.friendRequestPrivacy = privacy.whoCanSendRequests;
              }
              if (privacy?.hideFriendList !== undefined) {
                columnUpdates.hideFriendList = privacy.hideFriendList;
              }
              if (privacy?.hideOnlineStatus !== undefined) {
                columnUpdates.hideOnlineStatus = privacy.hideOnlineStatus;
              }
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
    // Simple sound player using Web Audio API
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'MESSAGE_RECEIVED') {
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === 'CALL_INCOMING') {
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.setValueAtTime(800, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      }
    } catch {
      // Audio not supported
    }
  },
}));
