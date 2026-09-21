import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { useContacts } from '@/hooks/useContacts';
import type { User } from '@/types';
import {
  safeGetStorageItem,
  safeSetStorageItem,
  safeRemoveStorageItem,
} from '@/lib/safeStorage';

export interface PhoneContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
}

export interface MatchedContact {
  contact: PhoneContact;
  user: User;
}

const STORAGE_KEY = 'gaga_phone_contacts';
const STORAGE_TIMESTAMP_KEY = 'gaga_contacts_synced_at';

/**
 * Default country code used to expand national phone numbers into E.164-style
 * digits before hashing. Overridable via the `gaga_default_country_code`
 * storage key (set from Settings → Privacy in a later section).
 */
const DEFAULT_COUNTRY_CODE = (() => {
  try {
    return safeGetStorageItem('gaga_default_country_code') || '880';
  } catch {
    return '880';
  }
})();

export function loadStoredPhoneContacts(): PhoneContact[] {
  try {
    const raw = safeGetStorageItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PhoneContact[]) : [];
  } catch {
    return [];
  }
}

export function saveStoredPhoneContacts(contacts: PhoneContact[]): void {
  try {
    safeSetStorageItem(STORAGE_KEY, JSON.stringify(contacts));
    safeSetStorageItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
  } catch {
    /* storage full or unavailable — ignore */
  }
}

export function getStoredPhoneSyncTime(): string | null {
  try {
    const ts = safeGetStorageItem(STORAGE_TIMESTAMP_KEY);
    if (!ts) return null;
    const diffMs = Date.now() - Number(ts);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch {
    return null;
  }
}

export interface UsePhoneContactsResult {
  phoneContacts: PhoneContact[];
  matchedContacts: MatchedContact[];
  unmatchedContacts: PhoneContact[];
  loadingContactMatch: boolean;
  contactsLoading: boolean;
  contactsSupported: boolean;
  syncTime: string | null;
  findContactsOnGaga: () => Promise<void>;
  syncContacts: () => Promise<void>;
  clearContacts: () => void;
  refreshMatches: () => void;
}

export function usePhoneContacts(userId: string | undefined): UsePhoneContactsResult {
  const { contacts: rawContacts, loading: contactsLoading, selectContacts, isSupported: contactsSupported } = useContacts();

  const [phoneContacts, setPhoneContacts] = useState<PhoneContact[]>(loadStoredPhoneContacts);
  const [matchedContacts, setMatchedContacts] = useState<MatchedContact[]>([]);
  const [unmatchedContacts, setUnmatchedContacts] = useState<PhoneContact[]>([]);
  const [loadingContactMatch, setLoadingContactMatch] = useState(false);
  const [syncTime, setSyncTime] = useState<string | null>(getStoredPhoneSyncTime);

  const refreshingRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setSyncTime(getStoredPhoneSyncTime()), 60000);
    return () => clearInterval(interval);
  }, []);

  const findContactsOnGaga = useCallback(async () => {
    if (!phoneContacts.length || !userId) return;
    setLoadingContactMatch(true);
    try {
      const [cmLib, dbLib] = await Promise.all([
        import('@/lib/contactMatching'),
        import('@/lib/supabaseDb'),
      ]);
      const {
        dedupeContactEntries,
        hashPhoneForDiscovery,
        hashEmailForDiscovery,
      } = cmLib;

      const cleanedContacts = dedupeContactEntries(phoneContacts);

      // Privacy-preserving discovery: hash every identifier locally and send
      // ONLY the hashes to the server. Raw phone numbers / emails never leave
      // the device. The `discover_contacts` RPC matches against stored hashes.
      const phoneHashPairs = await Promise.all(
        cleanedContacts.map(async (c) => ({
          contact: c,
          hash: await hashPhoneForDiscovery(c.phone, DEFAULT_COUNTRY_CODE),
        })),
      );
      const emailHashPairs = await Promise.all(
        cleanedContacts.map(async (c) => ({
          contact: c,
          hash: await hashEmailForDiscovery(c.email),
        })),
      );

      const phoneHashes = Array.from(new Set(phoneHashPairs.map((p) => p.hash).filter(Boolean)));
      const emailHashes = Array.from(new Set(emailHashPairs.map((p) => p.hash).filter(Boolean)));

      const db = dbLib.getDb();
      if (!db) throw new Error('Backend unavailable');

      const { data, error } = await db.rpc('discover_contacts', {
        p_phone_hashes: phoneHashes,
        p_email_hashes: emailHashes,
      });
      if (error) throw error;

      const foundUsers = (data || []) as Array<Record<string, unknown>>;
      const matched: MatchedContact[] = [];
      const matchedContactIds = new Set<string>();

      for (const row of foundUsers) {
        const u = {
          id: row.id as string,
          name: (row.name as string) || 'User',
          displayName: (row.display_name as string) || (row.name as string) || 'User',
          username: (row.username as string) || '',
          avatar: (row.avatar as string) || '',
          bio: (row.bio as string) || '',
          verified: (row.is_verified as boolean) || false,
        } as unknown as User;

        const rowPhoneHash = (row.phone_hash as string) || '';
        const rowEmailHash = (row.email_hash as string) || '';

        const matchingContact =
          phoneHashPairs.find((p) => p.hash && p.hash === rowPhoneHash)?.contact ||
          emailHashPairs.find((p) => p.hash && p.hash === rowEmailHash)?.contact;

        if (matchingContact) {
          matched.push({ contact: matchingContact, user: u });
          matchedContactIds.add(matchingContact.id);
        }
      }

      setMatchedContacts(matched);
      setUnmatchedContacts(cleanedContacts.filter((c) => !matchedContactIds.has(c.id)));
      if (matched.length > 0) {
        toast.success(`Found ${matched.length} contact${matched.length > 1 ? 's' : ''} on GaGa Chat!`);
      }
    } catch {
      toast.error('Could not match contacts.');
    } finally {
      setLoadingContactMatch(false);
    }
  }, [phoneContacts, userId]);

  const parseImportedContacts = useCallback(() => {
    if (!rawContacts.length) return;
    const parsed: PhoneContact[] = rawContacts.map((c, i) => ({
      id: `contact_${i}_${Date.now()}`,
      name: c.name?.[0] || 'Unknown',
      email: c.email?.[0] || undefined,
      phone: c.tel?.[0] || undefined,
    }));
    setPhoneContacts(parsed);
    saveStoredPhoneContacts(parsed);
    setSyncTime('Just now');
  }, [rawContacts]);

  useEffect(() => {
    if (rawContacts.length === 0) return;
    const t = setTimeout(() => parseImportedContacts(), 0);
    return () => clearTimeout(t);
  }, [rawContacts, parseImportedContacts]);

  const findDeferred = useCallback(() => {
    if (!userId || !phoneContacts.length) return;
    queueMicrotask(() => { void findContactsOnGaga(); });
  }, [userId, phoneContacts.length, findContactsOnGaga]);

  const refreshMatches = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setMatchedContacts([]);
    setUnmatchedContacts([]);
    findDeferred();
    const t = setTimeout(() => { refreshingRef.current = false; }, 1500);
    return () => clearTimeout(t);
  }, [findDeferred]);

  useEffect(() => {
    if (!userId) return;
    // Run matching once after phone contacts loaded.
    if (phoneContacts.length > 0) {
      queueMicrotask(() => { void findContactsOnGaga(); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const syncContacts = useCallback(async () => {
    if (!contactsSupported) {
      toast.error('Contact access not supported on this device. Try Chrome on Android.');
      return;
    }
    setMatchedContacts([]);
    setUnmatchedContacts([]);
    await selectContacts();
  }, [contactsSupported, selectContacts]);

  const clearContacts = useCallback(() => {
    setPhoneContacts([]);
    setMatchedContacts([]);
    setUnmatchedContacts([]);
    safeRemoveStorageItem(STORAGE_KEY);
    safeRemoveStorageItem(STORAGE_TIMESTAMP_KEY);
    setSyncTime(null);
    toast.success('Contacts cleared');
  }, []);

  return useMemo(() => ({
    phoneContacts,
    matchedContacts,
    unmatchedContacts,
    loadingContactMatch,
    contactsLoading,
    contactsSupported,
    syncTime,
    findContactsOnGaga,
    syncContacts,
    clearContacts,
    refreshMatches,
  }), [
    phoneContacts, matchedContacts, unmatchedContacts, loadingContactMatch,
    contactsLoading, contactsSupported, syncTime, findContactsOnGaga,
    syncContacts, clearContacts, refreshMatches,
  ]);
}

export const STORAGE_KEYS = { STORAGE_KEY, STORAGE_TIMESTAMP_KEY };
