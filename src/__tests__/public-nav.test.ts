import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
    readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('Public navigation', () => {
    it('avoids placeholder footer links and points to real destinations', () => {
        const footerSource = readSource('../components/Footer.tsx');

        expect(footerSource).not.toContain("href: '#' ");
        expect(footerSource).not.toContain("href='#'");
        expect(footerSource).toContain("to: '/about'");
        expect(footerSource).toContain("to: '/blog'");
        expect(footerSource).toContain("to: '/careers'");
        expect(footerSource).toContain("to: '/help'");
        expect(footerSource).toContain("to: '/community-guidelines'");
    });

    it('registers the public info routes used by the footer', () => {
        const appSource = readSource('../App.tsx');

        expect(appSource).toContain('path="/about"');
        expect(appSource).toContain('path="/blog"');
        expect(appSource).toContain('path="/careers"');
    });
});
