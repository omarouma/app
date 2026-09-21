import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { loadDeviceContacts, normalizeDeviceContacts, saveDeviceContacts } from '@/lib/deviceContacts';
import { isNative } from '@/lib/platform';

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
 * Reads all contacts from the native Android address book via the
 * @capacitor-community/contacts plugin. Handles the runtime permission
 * request (READ_CONTACTS) and maps the plugin's ContactPayload shape into
 * the app's internal { name, email, tel } shape.
 */
async function readNativeContacts(): Promise<Contact[]> {
  const { Contacts } = await import('@capacitor-community/contacts');

  let status = await Contacts.checkPermissions();
  if (status.contacts !== 'granted') {
    status = await Contacts.requestPermissions();
  }
  if (status.contacts !== 'granted') {
    throw new Error('Contacts permission denied');
  }

  const result = await Contacts.getContacts({
    projection: {
      name: true,
      phones: true,
      emails: true,
    },
  });

  return (result.contacts || []).map((c) => {
    const display = c.name?.display || [c.name?.given, c.name?.family].filter(Boolean).join(' ') || '';
    const tel = (c.phones || [])
      .map((p) => p.number)
      .filter((n): n is string => !!n);
    const email = (c.emails || [])
      .map((e) => e.address)
      .filter((a): a is string => !!a);
    return {
      name: display ? [display] : [],
      tel,
      email,
    };
  });
}

export function useContacts(): ContactResult {
  // Hydrate from local storage — contacts picked during onboarding (or a
  // previous session) are immediately available without re-importing.
  const [contacts, setContacts] = useState<Contact[]>(() => loadDeviceContacts());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported = useMemo(() => {
    if (isNative()) return true;
    return (
      typeof navigator !== 'undefined' &&
      'contacts' in navigator &&
      !!(navigator as NavigatorWithContacts).contacts?.select
    );
  }, []);

  const selectContacts = useCallback(async () => {
    if (!isSupported) {
      setError('Contacts API not supported on this device. Try Chrome on Android or a supported browser.');
      toast.error('Contacts API not supported');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let raw: Contact[];

      if (isNative()) {
        raw = await readNativeContacts();
      } else {
        raw = await (navigator as NavigatorWithContacts).contacts.select(
          ['name', 'email', 'tel'],
          { multiple: true }
        );
      }

      if (raw?.length > 0) {
        const parsed: Contact[] = normalizeDeviceContacts(
          raw.map((c) => ({
            name: c.name || [],
            email: c.email || [],
            tel: c.tel || [],
          }))
        );
        setContacts(parsed);
        saveDeviceContacts(parsed);
        toast.success(`Imported ${parsed.length} contacts`);
      } else {
        toast.info('No contacts found');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to access contacts';
      setError(msg);
      toast.error('Contact access denied or cancelled');
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  return { contacts, loading, error, selectContacts, isSupported };
}
