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
      const [fsLib, cmLib] = await Promise.all([
        import('@/lib/firestore'),
        import('@/lib/contactMatching'),
      ]);
      const { queryCollection, where, limit: qLimit } = fsLib;
      const { dedupeContactEntries, normalizeEmailForMatching, normalizePhoneForMatching } = cmLib;

      const cleanedContacts = dedupeContactEntries(phoneContacts);
      const emails = cleanedContacts
        .map((c) => normalizeEmailForMatching(c.email))
        .filter(Boolean) as string[];
      const phones = cleanedContacts
        .map((c) => normalizePhoneForMatching(c.phone))
        .filter(Boolean) as string[];

      const foundUsers: User[] = [];
      const emailQueries = emails.slice(0, 10).map(async (email) => {
        const data = await queryCollection('users', [where('email', '==', email), qLimit(1)]);
        foundUsers.push(...(data as unknown as User[]));
      });
      const phoneQueries = phones.slice(0, 10).map(async (phone) => {
        const data = await queryCollection('users', [
          where('phone', '>=', phone),
          where('phone', '<=', phone + '\uf8ff'),
          qLimit(5),
        ]);
        foundUsers.push(...(data as unknown as User[]));
      });
      await Promise.all([...emailQueries, ...phoneQueries]);

      const unique = Array.from(new Map(foundUsers.map((u) => [u.id, u])).values()).filter(
        (u) => u.id !== userId,
      );
      const matched: MatchedContact[] = [];
      const matchedContactIds = new Set<string>();

      for (const u of unique) {
        const userEmail = normalizeEmailForMatching(u.email || '');
        const userPhone = normalizePhoneForMatching(u.phone || '');
        const matchingContact = cleanedContacts.find((c) => {
          const contactEmail = normalizeEmailForMatching(c.email);
          const contactPhone = normalizePhoneForMatching(c.phone);
          return (
            (contactEmail && contactEmail === userEmail) ||
            (contactPhone && contactPhone === userPhone) ||
            (c.name && u.name && c.name.trim().toLowerCase() === u.name.trim().toLowerCase())
          );
        });
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
