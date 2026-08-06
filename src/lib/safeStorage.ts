export function safeGetStorageItem(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetJsonStorageItem<T>(key: string, value: T): boolean {
  try {
    return safeSetStorageItem(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

export function safeSetStorageItem(key: string, value: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveStorageItem(key: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function safeGetBooleanStorageItem(key: string, fallback = false): boolean {
  const value = safeGetStorageItem(key);
  if (value === null) return fallback;
  return value === 'true';
}

export function safeGetJsonStorageItem<T>(key: string, fallback: T): T {
  try {
    const raw = safeGetStorageItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeGetAllStorageKeys(): string[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    return Object.keys(window.localStorage);
  } catch {
    return [];
  }
}

export function safeClearStorageByPrefix(prefix: string): void {
  safeGetAllStorageKeys()
    .filter((k) => k.startsWith(prefix))
    .forEach((k) => safeRemoveStorageItem(k));
}
