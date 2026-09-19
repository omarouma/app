/**
 * GaGa Chat — Official contact channels.
 *
 * Single source of truth for every support / help / report / legal email
 * surfaced anywhere in the app. Import from here instead of hard-coding
 * addresses so branding stays consistent across web, PWA and native builds.
 */

export const CONTACT = {
  /** Primary support, help & report address (official inbox). */
  admin: 'admin@gagachat.app',
  /** General customer support. */
  support: 'support@gagachat.app',
  /** Privacy / data-protection requests. */
  privacy: 'privacy@gagachat.app',
  /** Legal & terms enquiries. */
  legal: 'legal@gagachat.app',
  /** Careers & hiring. */
  careers: 'careers@gagachat.app',
  /** Abuse / safety reports. */
  abuse: 'abuse@gagachat.app',
} as const;

export type ContactKey = keyof typeof CONTACT;

/** Build a `mailto:` link with an optional subject and body. */
export function mailto(
  key: ContactKey = 'admin',
  subject?: string,
  body?: string,
): string {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const query = params.toString();
  return `mailto:${CONTACT[key]}${query ? `?${query}` : ''}`;
}

/** Official website / canonical origin. */
export const SITE_URL = 'https://gagachat.app';
