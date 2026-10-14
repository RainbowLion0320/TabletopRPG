import { flushGameStorage, gameStorage } from './storage';

export const ONBOARDING_SEEN_KEY = 'trpg-onboarding-v1';

export function shouldOfferOnboarding(hasPreviousInvestigation: boolean): boolean {
  if (hasPreviousInvestigation) return false;
  try { return gameStorage.getItem(ONBOARDING_SEEN_KEY) !== 'seen'; }
  catch { return true; }
}

export function rememberOnboarding(): void {
  try {
    if (gameStorage.getItem(ONBOARDING_SEEN_KEY) === 'seen') return;
    gameStorage.setItem(ONBOARDING_SEEN_KEY, 'seen');
    void flushGameStorage().catch(() => undefined);
  } catch { /* The save also records completion; a preference cannot block play. */ }
}
