import { gameStorage } from '../../platform/storage';

const CAPABILITY_KEY = 'trpg-gateway-capabilities';
const MAX_REMEMBERED = 8;

/**
 * Some chat-compatible gateways reject strict structured output. Probing once
 * costs a round trip, so the verdict is remembered per endpoint+model instead of
 * living only in memory — otherwise every reload pays that probe again.
 */
export function isRelaxedGateway(gatewayKey: string): boolean {
  return readVerified().includes(gatewayKey);
}

export function rememberRelaxedGateway(gatewayKey: string): void {
  try {
    const known = readVerified();
    if (known.includes(gatewayKey)) return;
    gameStorage.setItem(CAPABILITY_KEY, JSON.stringify([...known, gatewayKey].slice(-MAX_REMEMBERED)));
  } catch {
    // A blocked write only costs one extra probe, never correctness.
  }
}

function readVerified(): string[] {
  try {
    const value: unknown = JSON.parse(gameStorage.getItem(CAPABILITY_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
