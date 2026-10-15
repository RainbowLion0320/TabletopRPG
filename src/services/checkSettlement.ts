import type { CheckContinuationAction } from '../types/game';

type SettledResources = NonNullable<CheckContinuationAction['checkResult']>['settledResources'];

/** Old saves have no receipt; malformed metadata must not authorize free damage. */
export function normalizeSettledResources(value: unknown): SettledResources {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const resources: NonNullable<SettledResources> = {};
  for (const stat of ['hp', 'san'] as const) {
    const delta = source[stat];
    if (typeof delta === 'number' && Number.isFinite(delta)) resources[stat] = Math.trunc(delta);
  }
  return Object.keys(resources).length ? resources : undefined;
}

/** Only receipts carried by the current dice continuation count as settled. */
export function getSettledResourceDelta(
  actions: readonly CheckContinuationAction[],
  playerName: string,
  stat: 'hp' | 'san'
): number {
  return actions.reduce((total, action) => action.player === playerName
    ? total + (normalizeSettledResources(action.checkResult?.settledResources)?.[stat] ?? 0)
    : total, 0);
}
