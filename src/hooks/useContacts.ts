import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { loadDeviceContacts, normalizeDeviceContacts, saveDeviceContacts } from '@/lib/deviceContacts';
import { isNative } from '@/lib/nativePlatform';

interface Contact {
  name: string[];
  email?: string[];
  tel?: string[];
}

interface NavigatorWithContacts extends Navigator {
  contacts: {
    select: (props: string[], opts: { multiple: boolean }) => Promise<Contact[]>;
  };
}

interface ContactResult {
  contacts: Contact[];
  loading: boolean;
  error: string | null;
  selectContacts: () => Promise<void>;
  isSupported: boolean;
}

/**
 * Read all contacts from the device using the native Capacitor Contacts plugin.
 * Only available inside the native Android/iOS shell.
 */
async function readNativeContacts(): Promise<Contact[]> {
  const { Contacts } = await import('@capacitor-community/contacts');

  // Request permission first (Android 6+ / iOS).
  const perm = await Contacts.requestPermissions();
  const state = perm?.contacts;
  if (state !== 'granted' && state !== 'limited') {
    throw new Error('Contacts permission denied');
  }

  const result = await Contacts.getContacts({
    projection: {
      name: true,
      emails: true,
      phones: true,
    },
  });

  const contacts = result?.contacts ?? [];
  return contacts.map((c) => ({
    name: [c.name?.display || [c.name?.given, c.name?.family].filter(Boolean).join(' ') || ''].filter(Boolean),
    email: (c.emails ?? []).map((e) => e.address || '').filter(Boolean),
    tel: (c.phones ?? []).map((p) => p.number || '').filter(Boolean),
  }));
}

export function useContacts(): ContactResult {
  // Hydrate from local storage — contacts picked during onboarding (or a
  // previous session) are immediately available without re-importing.
  const [contacts, setContacts] = useState<Contact[]>(() => loadDeviceContacts());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const native = isNative();

  const isSupported = useMemo(() => {
    if (native) return true; // native plugin is always available in the shell
    return (
      typeof navigator !== 'undefined' &&
      'contacts' in navigator &&
      !!(navigator as NavigatorWithContacts).contacts?.select
    );
  }, [native]);

  const selectContacts = useCallback(async () => {
    if (!isSupported) {
      setError('Contacts API not supported on this device. Try Chrome on Android or a supported browser.');
      toast.error('Contacts API not supported');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let raw: Contact[] = [];

      if (native) {
        raw = await readNativeContacts();
      } else {
        raw = await (navigator as NavigatorWithContacts).contacts.select(
          ['name', 'email', 'tel'],
          { multiple: true }
        );
      }

      if (raw?.length > 0) {
        const parsed: Contact[] = normalizeDeviceContacts(raw.map((c) => ({
          name: c.name || [],
          email: c.email || [],
          tel: c.tel || [],
        })));
        setContacts(parsed);
        saveDeviceContacts(parsed);
        toast.success(`Imported ${parsed.length} contacts`);
      } else {
        toast.info('No contacts found');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to access contacts';
      setError(msg);
      toast.error(
        msg.toLowerCase().includes('permission')
          ? 'Contacts permission denied'
          : 'Contact access denied or cancelled'
      );
    } finally {
      setLoading(false);
    }
  }, [isSupported, native]);

  return { contacts, loading, error, selectContacts, isSupported };
}
