import { safeGetStorageItem, safeSetStorageItem } from '@/lib/safeStorage';

const ONBOARDING_FLAG = 'gaga-onboarding-complete';

/** Whether the user has completed (or skipped) the onboarding flow. */
export function isOnboardingComplete(): boolean {
  return safeGetStorageItem(ONBOARDING_FLAG) === 'true';
}

/** Mark onboarding as completed (or skipped) so it is not shown again. */
export function markOnboardingComplete(): void {
  safeSetStorageItem(ONBOARDING_FLAG, 'true');
}

/** Where an authenticated user should land after login/signup. */
export function getPostAuthPath(isMobile: boolean): string {
  if (!isOnboardingComplete()) return '/onboarding';
  return isMobile ? '/contacts' : '/chat';
}
