import { describe, expect, it } from 'vitest';
import { normalizeDeviceContacts } from './deviceContacts';

describe('normalizeDeviceContacts', () => {
    it('de-dupes imported contacts by normalized email and phone values', () => {
        const contacts = [
            { name: ['Alice Smith'], email: [' ALICE@example.com '], tel: ['+1 (415) 555-0100'] },
            { name: ['Alice Smith'], email: ['alice@example.com'], tel: ['4155550100'] },
            { name: ['Bob Jones'], email: ['bob@example.com'], tel: ['+1 (415) 555-0200'] },
            { name: [], email: [], tel: [] },
        ];

        const normalized = normalizeDeviceContacts(contacts);

        expect(normalized).toHaveLength(2);
        expect(normalized.map((entry) => entry.email?.[0])).toEqual(['alice@example.com', 'bob@example.com']);
        expect(normalized[0]).toMatchObject({
            name: ['Alice Smith'],
            email: ['alice@example.com'],
        });
        expect(normalized[0].tel).toEqual(expect.arrayContaining(['14155550100', '4155550100']));
        expect(normalized[1]).toMatchObject({
            name: ['Bob Jones'],
            email: ['bob@example.com'],
        });
    });
});
