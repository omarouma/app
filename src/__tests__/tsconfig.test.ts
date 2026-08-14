import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readConfig = (relativePath: string) =>
    readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('TypeScript build config', () => {
    it('uses the supported deprecation guard value', () => {
        const rootConfig = readConfig('../../tsconfig.json');
        const appConfig = readConfig('../../tsconfig.app.json');

        expect(rootConfig).toMatch(/"ignoreDeprecations"\s*:\s*"5\.0"/);
        expect(appConfig).toMatch(/"ignoreDeprecations"\s*:\s*"5\.0"/);
    });
});
