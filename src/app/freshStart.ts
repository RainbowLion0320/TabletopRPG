import { gameStorage } from '../platform/storage';
import { API_CONFIG_KEY, SAVE_KEY, getEnvDefaultApiConfig } from '../services/storage';
import { ONBOARDING_SEEN_KEY } from '../platform/onboarding';
import { OPENING_SEEN_KEY } from '../platform/opening';

const FRESH_PARAM = 'fresh';

/**
 * A dev-server only reset path: visiting `?fresh=1` drops the saved investigations
 * and the "already seen" marks, then reloads without the parameter so a later
 * refresh cannot wipe the run the reader has just begun.
 *
 * Clearing the marks alone is never enough: a single remaining save suppresses the
 * first-investigation lesson, so the library has to go with them.
 *
 * A saved connection is dropped only when the environment already supplies one —
 * a stale browser copy would otherwise shadow the working .env.local settings.
 */
export function resetProgressIfRequested(): void {
  if (!import.meta.env.DEV) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get(FRESH_PARAM) !== '1') return;
  try {
    gameStorage.removeItem(SAVE_KEY);
    gameStorage.removeItem(ONBOARDING_SEEN_KEY);
    gameStorage.removeItem(OPENING_SEEN_KEY);
    if (getEnvDefaultApiConfig().apiKey) gameStorage.removeItem(API_CONFIG_KEY);
  } catch {
    // Blocked storage leaves the marks in place; the reload still gives a clean read.
  }
  url.searchParams.delete(FRESH_PARAM);
  window.history.replaceState(null, '', url.toString());
  window.location.reload();
}
