export interface ContactMatchCandidate {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
}

/**
 * Normalize a phone number for matching.
 *
 * Strips all non-digits, removes the international dialing prefix `00`, and
 * (when a default country code is supplied) expands a national number into
 * E.164-style digits so that `01712345678` (BD) and `8801712345678` match.
 */
export function normalizePhoneForMatching(phone?: string, defaultCountryCode?: string): string {
    if (!phone) return '';

    let digits = phone.replace(/\D/g, '');
    if (!digits) return '';

    // Strip international dialing prefix 00
    if (digits.startsWith('00')) digits = digits.slice(2);

    // Expand national numbers using the default country code when provided.
    if (defaultCountryCode) {
        const cc = defaultCountryCode.replace(/\D/g, '');
        if (cc && !digits.startsWith(cc)) {
            // Leading 0 is the national trunk prefix — drop it before prepending.
            const national = digits.startsWith('0') ? digits.slice(1) : digits;
            digits = cc + national;
        }
    }

    return digits;
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

/**
 * SHA-256 hash (hex) of a normalized identifier. Used for privacy-preserving
 * contact discovery — only hashes leave the device, never raw phone/email.
 */
export async function hashIdentifier(value: string): Promise<string> {
    if (!value) return '';
    const enc = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export async function hashPhoneForDiscovery(phone?: string, defaultCountryCode?: string): Promise<string> {
    const normalized = normalizePhoneForMatching(phone, defaultCountryCode);
    return normalized ? hashIdentifier(normalized) : '';
}

export async function hashEmailForDiscovery(email?: string): Promise<string> {
    const normalized = normalizeEmailForMatching(email);
    return normalized ? hashIdentifier(normalized) : '';
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
