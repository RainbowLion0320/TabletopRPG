import { flushGameStorage, gameStorage } from './storage';

/**
 * Records that the guide was walked through once. It is no longer a gate: every
 * new game opens the guide, because it is the shortest way back into the rules
 * after a break and the guide itself offers 跳过 to anyone who knows the case.
 * The mark stays as the only place a future "don't teach me again" preference
 * could read from, and ?fresh=1 still clears it.
 */
export const ONBOARDING_SEEN_KEY = 'trpg-onboarding-v1';

/**
 * An explicit "never show the guide again" switch. Nothing in the game writes
 * it yet, so a normal player sees the lesson on every new game; the end-to-end
 * suite sets it to `off` so a scenario can exercise post-guide play without
 * walking the lesson first. A future settings toggle would use this same key.
 */
export const TUTORIAL_OPT_OUT_KEY = 'trpg-tutorial-opt-out';

export function shouldOfferOnboarding(): boolean {
  try { return gameStorage.getItem(TUTORIAL_OPT_OUT_KEY) !== 'off'; }
  catch { return true; }
}

export function rememberOnboarding(): void {
  try {
    if (gameStorage.getItem(ONBOARDING_SEEN_KEY) === 'seen') return;
    gameStorage.setItem(ONBOARDING_SEEN_KEY, 'seen');
    void flushGameStorage().catch(() => undefined);
  } catch { /* The save also records completion; a preference cannot block play. */ }
}
