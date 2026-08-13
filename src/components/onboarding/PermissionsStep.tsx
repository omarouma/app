import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bell, Mic, Camera, MapPin, Users, Check, AlertTriangle, Ban,
} from 'lucide-react';
import { toast } from 'sonner';

type PermissionState = 'idle' | 'granted' | 'denied' | 'unavailable' | 'requesting';

interface PermissionItem {
  id: string;
  icon: typeof Bell;
  title: string;
  description: string;
  color: string;
  bg: string;
  state: PermissionState;
}

const MIC_CAM_STOP_DELAY_MS = 300;

/** Stop every track on a stream — we only wanted the permission grant. */
function releaseStream(stream: MediaStream | null | undefined) {
  try {
    stream?.getTracks().forEach((t) => t.stop());
  } catch { /* noop */ }
}

async function queryPermission(name: PermissionName): Promise<PermissionState | null> {
  try {
    if (!('permissions' in navigator)) return null;
    const result = await navigator.permissions.query({ name });
    if (result.state === 'granted') return 'granted';
    if (result.state === 'denied') return 'denied';
    return 'idle';
  } catch {
    return null; // browser doesn't support querying this permission
  }
}

export default function PermissionsStep() {
  const [items, setItems] = useState<PermissionItem[]>([
    {
      id: 'notifications',
      icon: Bell,
      title: 'Notifications',
      description: 'Get alerts for new messages and incoming calls, even when the app is closed.',
      color: 'text-[#00C300]',
      bg: 'bg-[#00C300]/10',
      state: 'idle',
    },
    {
      id: 'microphone',
      icon: Mic,
      title: 'Microphone',
      description: 'Required for voice calls and sending voice messages to your friends.',
      color: 'text-[#8B5CF6]',
      bg: 'bg-[#8B5CF6]/10',
      state: 'idle',
    },
    {
      id: 'camera',
      icon: Camera,
      title: 'Camera',
      description: 'Required for video calls and sharing photos & videos in chats.',
      color: 'text-[#2196F3]',
      bg: 'bg-[#2196F3]/10',
      state: 'idle',
    },
    {
      id: 'location',
      icon: MapPin,
      title: 'Location',
      description: 'Share your live location with friends in chats when you choose to.',
      color: 'text-[#FF3B30]',
      bg: 'bg-[#FF3B30]/10',
      state: 'idle',
    },
    {
      id: 'contacts',
      icon: Users,
      title: 'Contacts',
      description: 'Find friends from your device contacts who are already on GaGa Chat.',
      color: 'text-[#FF9800]',
      bg: 'bg-[#FF9800]/10',
      state: 'idle',
    },
  ]);

  const updateState = (id: string, state: PermissionState) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, state } : it)));
  };

  // Pre-fill current browser permission states (no prompts fired here)
  useEffect(() => {
    void (async () => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        updateState(
          'notifications',
          Notification.permission === 'granted'
            ? 'granted'
            : Notification.permission === 'denied'
              ? 'denied'
              : 'idle',
        );
      } else {
        updateState('notifications', 'unavailable');
      }

      const mic = await queryPermission('microphone' as PermissionName);
      if (mic) updateState('microphone', mic);
      const cam = await queryPermission('camera' as PermissionName);
      if (cam) updateState('camera', cam);
      const geo = await queryPermission('geolocation' as PermissionName);
      if (geo) updateState('location', geo);

      // Contact Picker API: Chrome on Android only
      if (!('contacts' in navigator) || typeof (navigator as any).contacts?.select !== 'function') {
        updateState('contacts', 'unavailable');
      }
    })();
  }, []);

  const requestNotifications = async () => {
    if (!('Notification' in window)) { updateState('notifications', 'unavailable'); return; }
    updateState('notifications', 'requesting');
    try {
      const result = await Notification.requestPermission();
      updateState('notifications', result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'idle');
    } catch {
      updateState('notifications', 'idle');
    }
  };

  const requestMedia = async (kind: 'microphone' | 'camera') => {
    if (!navigator.mediaDevices?.getUserMedia) { updateState(kind, 'unavailable'); return; }
    updateState(kind, 'requesting');
    try {
      const constraints: MediaStreamConstraints =
        kind === 'microphone' ? { audio: true } : { video: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // Release the hardware immediately — we only needed the grant
      setTimeout(() => releaseStream(stream), MIC_CAM_STOP_DELAY_MS);
      updateState(kind, 'granted');
    } catch (e) {
      const name = (e as DOMException)?.name;
      updateState(kind, name === 'NotAllowedError' ? 'denied' : 'idle');
      if (name === 'NotFoundError') {
        toast.error(kind === 'microphone' ? 'No microphone found on this device.' : 'No camera found on this device.');
        updateState(kind, 'unavailable');
      }
    }
  };

  const requestLocation = async () => {
    if (!('geolocation' in navigator)) { updateState('location', 'unavailable'); return; }
    updateState('location', 'requesting');
    navigator.geolocation.getCurrentPosition(
      () => updateState('location', 'granted'),
      (err) => updateState('location', err.code === err.PERMISSION_DENIED ? 'denied' : 'idle'),
      { timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const requestContacts = async () => {
    const contactsApi = (navigator as any).contacts;
    if (!contactsApi || typeof contactsApi.select !== 'function') {
      updateState('contacts', 'unavailable');
      return;
    }
    updateState('contacts', 'requesting');
    try {
      const selected = await contactsApi.select(['name', 'tel'], { multiple: true });
      updateState('contacts', 'granted');
      if (Array.isArray(selected) && selected.length > 0) {
        toast.success(`${selected.length} contact${selected.length > 1 ? 's' : ''} selected — friend matching coming soon.`);
      }
    } catch {
      // User cancelled the picker — back to idle, not an error
      updateState('contacts', 'idle');
    }
  };

  const handleAllow = (id: string) => {
    switch (id) {
      case 'notifications': return requestNotifications();
      case 'microphone': return requestMedia('microphone');
      case 'camera': return requestMedia('camera');
      case 'location': return requestLocation();
      case 'contacts': return requestContacts();
    }
  };

  const grantedCount = items.filter((i) => i.state === 'granted').length;

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-5">
        <h2 className="text-2xl font-bold text-[#111111] mb-2">App Permissions</h2>
        <p className="text-[#8D8D8D] text-sm leading-relaxed">
          GaGa Chat works best with these permissions. You can change them anytime in your browser settings.
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06, duration: 0.25 }}
              className="flex items-center gap-3 p-3.5 rounded-2xl border border-[#EBEBEB] bg-white"
            >
              <div className={`w-11 h-11 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
                <Icon size={22} className={item.color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#111111] text-sm font-semibold">{item.title}</p>
                <p className="text-[#8D8D8D] text-xs leading-snug mt-0.5">{item.description}</p>
              </div>
              <div className="shrink-0">
                {item.state === 'granted' && (
                  <span className="inline-flex items-center gap-1 text-[#00C300] text-xs font-semibold">
                    <Check size={14} /> Allowed
                  </span>
                )}
                {item.state === 'denied' && (
                  <span className="inline-flex items-center gap-1 text-[#FF9800] text-xs font-semibold" title="Enable it in your browser's site settings">
                    <AlertTriangle size={14} /> Blocked
                  </span>
                )}
                {item.state === 'unavailable' && (
                  <span className="inline-flex items-center gap-1 text-[#B0B0B0] text-xs font-medium">
                    <Ban size={13} /> N/A
                  </span>
                )}
                {(item.state === 'idle' || item.state === 'requesting') && (
                  <button
                    type="button"
                    onClick={() => handleAllow(item.id)}
                    disabled={item.state === 'requesting'}
                    className="px-3.5 py-1.5 rounded-full bg-[#00C300] text-white text-xs font-bold hover:bg-[#00A300] transition-colors disabled:opacity-50"
                  >
                    {item.state === 'requesting' ? 'Asking…' : 'Allow'}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <p className="text-center text-[#B0B0B0] text-xs mt-4">
        {grantedCount} of {items.filter((i) => i.state !== 'unavailable').length} permissions allowed
      </p>
    </div>
  );
}
