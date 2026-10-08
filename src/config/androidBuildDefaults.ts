/** Explicit APK-only defaults. Never read shell values while serving a preview. */
export function getAndroidAiDefines(command: 'build' | 'serve', env: Record<string, string | undefined>) {
  const apiKey = command === 'build' ? (env.APIKEY_MIMO ?? '').trim() : '';
  const fields: Record<string, string> = { PROVIDER: '', PROTOCOL: '', ENDPOINT: '', API_KEY: '', MODEL: '' };
  if (apiKey) {
    if (!/^(?:tp|ttp)-\S+$/.test(apiKey)) throw new Error('APIKEY_MIMO must be a single-line MiMo Token Plan key.');
    const endpoint = (env.MIMO_TOKEN_PLAN_ENDPOINT ?? 'https://token-plan-cn.xiaomimimo.com/v1').replace(/\/+$/, '');
    if (!/^https:\/\/token-plan-(?:cn|sgp|ams)\.xiaomimimo\.com\/v1$/.test(endpoint)) {
      throw new Error('MIMO_TOKEN_PLAN_ENDPOINT must be an official MiMo Token Plan regional base URL.');
    }
    Object.assign(fields, { PROVIDER: 'mimo', PROTOCOL: 'responses', ENDPOINT: endpoint, API_KEY: apiKey, MODEL: 'mimo-v2.6-pro' });
  }
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [`import.meta.env.VITE_AI_${key}`, JSON.stringify(value)]));
}
