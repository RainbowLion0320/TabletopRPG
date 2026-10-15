/** A brief authored reply beat, independent of the real model's response time. */
export const ONBOARDING_REPLY_DELAY_MS = 1400;

export function waitForOnboardingReply(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ONBOARDING_REPLY_DELAY_MS);
    signal.addEventListener('abort', abort, { once: true });
  });
}
