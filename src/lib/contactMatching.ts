export interface ContactMatchCandidate {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
}

export function normalizePhoneForMatching(phone?: string): string {
    if (!phone) return '';

    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';

    return digits.startsWith('00') ? digits.slice(2) : digits;
}

export function normalizeEmailForMatching(email?: string): string {
    if (!email) return '';

    const trimmed = email.trim().toLowerCase();
    const atIndex = trimmed.indexOf('@');
    if (atIndex <= 0) return trimmed;

    const local = trimmed.slice(0, atIndex).replace(/\./g, '');
    const domain = trimmed.slice(atIndex + 1);
    return `${local}@${domain}`;
}

export function dedupeContactEntries<T extends ContactMatchCandidate>(contacts: T[]): T[] {
    const seen = new Map<string, T>();

    for (const contact of contacts) {
        const emailKey = normalizeEmailForMatching(contact.email);
        const phoneKey = normalizePhoneForMatching(contact.phone);
        const identityKey = [emailKey, phoneKey, (contact.name || '').trim().toLowerCase()].filter(Boolean).join('|');

        if (!identityKey) {
            const fallbackKey = `fallback:${contact.id || Math.random().toString(36).slice(2)}`;
            if (!seen.has(fallbackKey)) seen.set(fallbackKey, contact);
            continue;
        }

        const key = emailKey || phoneKey || (contact.name || '').trim().toLowerCase();
        if (!seen.has(key)) {
            seen.set(key, contact);
        }
    }

    return Array.from(seen.values());
}
