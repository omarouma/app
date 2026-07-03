import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface Contact {
  name: string[];
  email?: string[];
  tel?: string[];
}

interface ContactResult {
  contacts: Contact[];
  loading: boolean;
  error: string | null;
  selectContacts: () => Promise<void>;
  isSupported: boolean;
}

export function useContacts(): ContactResult {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if Contacts API is supported
  const isSupported =
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!(navigator as any).contacts?.select;


  const selectContacts = useCallback(async () => {
    if (!isSupported) {
      setError('Contacts API not supported on this device. Try Chrome on Android or a supported browser.');
      toast.error('Contacts API not supported');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const props = ['name', 'email', 'tel'];
      const opts = { multiple: true };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = await (navigator as any).contacts.select(props, opts);
      
      if (results && results.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed: Contact[] = results.map((c: any) => ({
          name: c.name || [],
          email: c.email || [],
          tel: c.tel || [],
        }));
        setContacts(parsed);
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
