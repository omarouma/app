import { describe, expect, it } from 'vitest';

import { dedupeContactEntries, normalizeEmailForMatching, normalizePhoneForMatching } from './contactMatching';

interface Contact {
    id: string;
    phone?: string;
    email?: string;
}

describe('contact matching helpers', () => {
    it('normalizes phone numbers for matching across formats', () => {
        expect(normalizePhoneForMatching('+1 (415) 555-1234')).toBe('14155551234');
        expect(normalizePhoneForMatching('415-555-1234')).toBe('4155551234');
        expect(normalizePhoneForMatching('  +44 20 7946 0958 ')).toBe('442079460958');
    });

    it('normalizes emails consistently for matching', () => {
        expect(normalizeEmailForMatching(' User.Name+tag@Example.COM ')).toBe('username+tag@example.com');
        expect(normalizeEmailForMatching('')).toBe('');
    });

    it('deduplicates equivalent contacts before matching', () => {
        const contacts = [
            { id: 'a', name: 'Alice', email: 'alice@example.com', phone: '+1 (555) 111-2222' },
            { id: 'b', name: 'Alice', email: 'ALICE@example.com', phone: '15551112222' },
            { id: 'c', name: 'Bob', email: 'bob@example.com', phone: '+1 (555) 333-4444' },
        ];

        expect(dedupeContactEntries(contacts)).toHaveLength(2);
        expect(dedupeContactEntries(contacts).map((item: Contact) => item.id)).toEqual(['a', 'c']);
    });
});
