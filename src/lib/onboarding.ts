import { safeGetStorageItem, safeSetStorageItem } from '@/lib/safeStorage';

const ONBOARDING_FLAG = 'gaga-onboarding-complete';
const TERMS_VERSION_KEY = 'gaga-terms-version';

/** Current legal documents version. Bump when Terms/Privacy change materially. */
export const CURRENT_TERMS_VERSION = '2026-09-01';

/** Whether the user has completed (or skipped) the onboarding flow. */
export function isOnboardingComplete(): boolean {
  return safeGetStorageItem(ONBOARDING_FLAG) === 'true';
}

/** Mark onboarding as completed (or skipped) so it is not shown again. */
export function markOnboardingComplete(): void {
  safeSetStorageItem(ONBOARDING_FLAG, 'true');
}

/** The Terms/Privacy version the user last accepted, or null if never. */
export function getAcceptedTermsVersion(): string | null {
  return safeGetStorageItem(TERMS_VERSION_KEY);
}

/** Record that the user accepted the current Terms/Privacy version. */
export function acceptTerms(version: string = CURRENT_TERMS_VERSION): void {
  safeSetStorageItem(TERMS_VERSION_KEY, version);
}

/** Whether the user has accepted the current Terms/Privacy version. */
export function hasAcceptedCurrentTerms(): boolean {
  return getAcceptedTermsVersion() === CURRENT_TERMS_VERSION;
}

/** Where an authenticated user should land after login/signup. */
export function getPostAuthPath(isMobile: boolean): string {
  if (!isOnboardingComplete()) return '/onboarding';
  return isMobile ? '/contacts' : '/chat';
}
