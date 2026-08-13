import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { loadDeviceContacts, saveDeviceContacts } from '@/lib/deviceContacts';

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

export function useContacts(): ContactResult {
  // Hydrate from local storage — contacts picked during onboarding (or a
  // previous session) are immediately available without re-importing.
  const [contacts, setContacts] = useState<Contact[]>(() => loadDeviceContacts());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported = useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      'contacts' in navigator &&
      !!(navigator as NavigatorWithContacts).contacts?.select,
    []
  );

  const selectContacts = useCallback(async () => {
    if (!isSupported) {
      setError('Contacts API not supported on this device. Try Chrome on Android or a supported browser.');
      toast.error('Contacts API not supported');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await (navigator as NavigatorWithContacts).contacts.select(
        ['name', 'email', 'tel'],
        { multiple: true }
      );

      if (results?.length > 0) {
        const parsed: Contact[] = results.map((c) => ({
          name: c.name || [],
          email: c.email || [],
          tel: c.tel || [],
        }));
        setContacts(parsed);
        saveDeviceContacts(parsed);
        toast.success(`Imported ${parsed.length} contacts`);
      } else {
        toast.info('No contacts selected');
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
