import { safeGetJsonStorageItem, safeSetStorageItem } from '@/lib/safeStorage';

export interface DeviceContact {
  name: string[];
  email?: string[];
  tel?: string[];
}

const STORAGE_KEY = 'gaga-imported-contacts';

/**
 * Imported device contacts, shared between the onboarding permissions step
 * and Add Friends → Contacts tab. Persisted locally so a user who grants
 * contact access during onboarding sees matches later without re-picking.
 */
export function loadDeviceContacts(): DeviceContact[] {
  return safeGetJsonStorageItem<DeviceContact[]>(STORAGE_KEY, []);
}

export function saveDeviceContacts(contacts: DeviceContact[]): void {
  safeSetStorageItem(STORAGE_KEY, JSON.stringify(contacts));
}

export function clearDeviceContacts(): void {
  safeSetStorageItem(STORAGE_KEY, '[]');
}
