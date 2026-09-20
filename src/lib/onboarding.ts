import { safeGetStorageItem, safeSetStorageItem } from '@/lib/safeStorage';
import { shouldShowOnboarding } from '@/lib/platform';

const ONBOARDING_FLAG = 'gaga-onboarding-complete';

/** Whether the user has completed (or skipped) the onboarding flow. */
export function isOnboardingComplete(): boolean {
  return safeGetStorageItem(ONBOARDING_FLAG) === 'true';
}

/** Mark onboarding as completed (or skipped) so it is not shown again. */
export function markOnboardingComplete(): void {
  safeSetStorageItem(ONBOARDING_FLAG, 'true');
}

/**
 * Where an authenticated user should land after login/signup.
 *
 * Native (Android/iOS) builds skip the onboarding carousel entirely and drop
 * the user straight into the main app. Web builds keep the onboarding flow.
 */
export function getPostAuthPath(isMobile: boolean): string {
  if (shouldShowOnboarding() && !isOnboardingComplete()) return '/onboarding';
  return isMobile ? '/contacts' : '/chat';
}
