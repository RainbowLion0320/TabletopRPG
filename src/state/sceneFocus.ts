import { storyData } from '../data/storyData';
import type { SceneId } from '../types/game';

export function defaultActiveNpcForScene(sceneId: SceneId): string | null {
  return storyData.scenes[sceneId]?.npcs[0] ?? null;
}

function knownNpcName(value: unknown): string | null {
  return typeof value === 'string' && storyData.npcs[value] ? value : null;
}

interface ResolveActiveNpcInput {
  previousScene: SceneId;
  nextScene: SceneId;
  previousActiveNpc: string | null;
  requestedActiveNpc?: string | null;
  requestedActiveNpcProvided: boolean;
}

/**
 * Keeps the stage character consistent with the focused scene.
 *
 * An explicit active NPC always wins. An explicit null still clears the
 * character while staying in one scene, but a scene transition falls back to
 * that scene's authored resident instead of leaving the old character on the
 * new backdrop (or rendering an unexpectedly empty stage).
 */
export function resolveActiveNpcForScene({
  previousScene,
  nextScene,
  previousActiveNpc,
  requestedActiveNpc,
  requestedActiveNpcProvided
}: ResolveActiveNpcInput): string | null {
  if (requestedActiveNpcProvided) {
    const requested = knownNpcName(requestedActiveNpc);
    if (requested) return requested;
    return previousScene === nextScene ? null : defaultActiveNpcForScene(nextScene);
  }

  if (previousScene !== nextScene) return defaultActiveNpcForScene(nextScene);
  return knownNpcName(previousActiveNpc) ?? defaultActiveNpcForScene(nextScene);
}
