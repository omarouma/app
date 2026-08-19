import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readConfig = (relativePath: string) =>
    readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('TypeScript build config', () => {
    it('does not rely on deprecated baseUrl configuration', () => {
        const rootConfig = readConfig('../../tsconfig.json');
        const appConfig = readConfig('../../tsconfig.app.json');

        expect(rootConfig).not.toMatch(/"baseUrl"\s*:/);
        expect(rootConfig).not.toMatch(/"ignoreDeprecations"\s*:/);
        expect(appConfig).not.toMatch(/"baseUrl"\s*:/);
        expect(appConfig).not.toMatch(/"ignoreDeprecations"\s*:/);
    });

    it('has strict mode enabled', () => {
        const appConfig = readConfig('../../tsconfig.app.json');
        expect(appConfig).toMatch(/"strict"\s*:\s*true/);
    });
});