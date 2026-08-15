import { safeGetJsonStorageItem, safeSetStorageItem } from '@/lib/safeStorage';

export interface DeviceContact {
  name: string[];
  email?: string[];
  tel?: string[];
}

const STORAGE_KEY = 'gaga-imported-contacts';

function normalizeContactName(name?: string): string | null {
  const cleaned = name?.trim();
  return cleaned ? cleaned.replace(/\s+/g, ' ') : null;
}

export function normalizeContactEmail(email?: string): string | undefined {
  const cleaned = email?.trim().toLowerCase();
  if (!cleaned) return undefined;
  const atIndex = cleaned.indexOf('@');
  if (atIndex <= 0) return cleaned;
  const local = cleaned.slice(0, atIndex).replace(/\./g, '').replace(/\s+/g, '');
  const domain = cleaned.slice(atIndex + 1).trim();
  return `${local}@${domain}`;
}

export function normalizeContactPhone(phone?: string): string | undefined {
  const digits = phone?.replace(/\D/g, '') || '';
  if (!digits) return undefined;
  return digits.startsWith('00') ? digits.slice(2) : digits;
}

export function normalizeDeviceContacts<T extends DeviceContact>(contacts: T[]): T[] {
  const deduped = new Map<string, T>();
  const emailIndex = new Map<string, string>();
  const phoneIndex = new Map<string, string>();
  const nameIndex = new Map<string, string>();

  const record = (entry: T, dedupeKey: string) => {
    const existing = deduped.get(dedupeKey);
    if (!existing) {
      deduped.set(dedupeKey, entry);
      return;
    }

    const mergedName = Array.from(new Set([...(existing.name || []), ...(entry.name || [])])).filter(Boolean);
    const mergedEmail = Array.from(new Set([...(existing.email || []), ...(entry.email || [])])).filter(Boolean);
    const mergedTel = Array.from(new Set([...(existing.tel || []), ...(entry.tel || [])])).filter(Boolean);

    deduped.set(dedupeKey, {
      ...existing,
      name: mergedName,
      email: mergedEmail,
      tel: mergedTel,
    } as T);
  };

  for (const contact of contacts) {
    const name = normalizeContactName(contact.name?.[0]);
    const email = normalizeContactEmail(contact.email?.[0]);
    const tel = normalizeContactPhone(contact.tel?.[0]);

    if (!name && !email && !tel) {
      continue;
    }

    const normalizedEntry = {
      ...contact,
      name: name ? [name] : [],
      email: email ? [email] : [],
      tel: tel ? [tel] : [],
    } as T;

    if (email && emailIndex.has(email)) {
      record(normalizedEntry, emailIndex.get(email)!);
      continue;
    }
    if (tel && phoneIndex.has(tel)) {
      record(normalizedEntry, phoneIndex.get(tel)!);
      continue;
    }
    if (name && nameIndex.has(name.toLowerCase())) {
      record(normalizedEntry, nameIndex.get(name.toLowerCase())!);
      continue;
    }

    const dedupeKey = `contact:${String(deduped.size + 1)}`;
    record(normalizedEntry, dedupeKey);
    if (email) emailIndex.set(email, dedupeKey);
    if (tel) phoneIndex.set(tel, dedupeKey);
    if (name) nameIndex.set(name.toLowerCase(), dedupeKey);
  }

  return Array.from(deduped.values());
}

/**
 * Imported device contacts, shared between the onboarding permissions step
 * and Add Friends → Contacts tab. Persisted locally so a user who grants
 * contact access during onboarding sees matches later without re-picking.
 */
export function loadDeviceContacts(): DeviceContact[] {
  return normalizeDeviceContacts(safeGetJsonStorageItem<DeviceContact[]>(STORAGE_KEY, []));
}

export function saveDeviceContacts(contacts: DeviceContact[]): void {
  safeSetStorageItem(STORAGE_KEY, JSON.stringify(normalizeDeviceContacts(contacts)));
}

export function clearDeviceContacts(): void {
  safeSetStorageItem(STORAGE_KEY, '[]');
}
