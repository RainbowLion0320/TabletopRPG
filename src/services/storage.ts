import type { ApiConfig, GameState, IncompatibleSaveSlot, SaveSlot } from '../types/game';
import { isAiProtocol, isAiProvider, normalizeApiConfig } from '../config/aiConfig';
import { storyData } from '../data/storyData';
import { hydrateGameState } from '../state/gameReducer';
import { ScenarioContentMismatchError } from '../scenario/engine';
import { gameStorage, flushGameStorage } from '../platform/storage';

const SAVE_KEY = 'trpg-saves-v2';
const API_KEY = 'trpg-api';
const MAX_SAVES = 12;

function parseArray(key: string): unknown[] {
  try {
    const value = JSON.parse(gameStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSaveSlot(value: unknown): SaveSlot | null {
  if (!isRecord(value)) return null;

  const gameState = hydrateGameState(value.gameState);
  if (!gameState.players.length) return null;

  const id = Number(value.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 8_640_000_000_000_000) return null;
  const savedAt = typeof value.savedAt === 'string' && value.savedAt.trim()
    ? value.savedAt
    : new Date(id).toLocaleString('zh-CN');

  const version: SaveSlot['version'] =
    value.version === 8 ? 8 :
    value.version === 7 ? 7 :
    value.version === 6 ? 6 :
    value.version === 5 ? 5 :
    value.version === 4 ? 4 :
    value.version === 3 ? 3 :
    value.version === 2 ? 2 : 1;

  return {
    id,
    savedAt,
    scene: storyData.scenes[gameState.currentScene].name,
    players: gameState.players.map((player) => player.name).join('、'),
    gameState,
    moduleId: gameState.scenarioProgress.moduleId,
    moduleVersion: gameState.scenarioProgress.moduleVersion,
    contentHash: gameState.scenarioProgress.contentHash,
    version
  };
}

export interface SaveLibrary {
  saves: SaveSlot[];
  incompatible: IncompatibleSaveSlot[];
}

function incompatibleSaveSlot(value: unknown, reason: string): IncompatibleSaveSlot | null {
  if (!isRecord(value)) return null;
  const id = Number(value.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : '时间未知',
    scene: typeof value.scene === 'string' ? value.scene : '未知场景',
    players: typeof value.players === 'string' ? value.players : '调查员未知',
    reason
  };
}

export function readSaveLibrary(): SaveLibrary {
  const merged: SaveSlot[] = [];
  const incompatible: IncompatibleSaveSlot[] = [];
  for (const slot of parseArray(SAVE_KEY)) {
    try {
      const normalized = normalizeSaveSlot(slot);
      if (normalized) merged.push(normalized);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn('[storage] 存档因模组版本不兼容而拒绝载入：', reason);
      if (error instanceof ScenarioContentMismatchError) {
        const blocked = incompatibleSaveSlot(slot, reason);
        if (blocked) incompatible.push(blocked);
      }
    }
  }
  merged.sort((a, b) => b.id - a.id);
  incompatible.sort((a, b) => b.id - a.id);

  const deduped = new Map<number, SaveSlot>();
  merged.forEach((slot) => {
    if (!deduped.has(slot.id)) deduped.set(slot.id, slot);
  });

  return {
    saves: [...deduped.values()].slice(0, MAX_SAVES),
    incompatible: incompatible.slice(0, MAX_SAVES)
  };
}

export function readSaves(): SaveSlot[] {
  return readSaveLibrary().saves;
}

export function saveGameState(gameState: GameState) {
  const normalizedState = hydrateGameState(gameState);
  const rawSaves = parseArray(SAVE_KEY);
  const slot: SaveSlot = {
    id: Math.max(Date.now(), ...rawSaves.flatMap((save) => {
      const previousId = isRecord(save) ? Number(save.id) : NaN;
      return Number.isSafeInteger(previousId) && previousId > 0 && previousId < 8_640_000_000_000_000
        ? [previousId + 1] : [];
    })),
    savedAt: new Date().toLocaleString('zh-CN'),
    scene: storyData.scenes[normalizedState.currentScene].name,
    players: normalizedState.players.map((player) => player.name).join('、'),
    gameState: normalizedState,
    moduleId: normalizedState.scenarioProgress.moduleId,
    moduleVersion: normalizedState.scenarioProgress.moduleVersion,
    contentHash: normalizedState.scenarioProgress.contentHash,
    version: 8
  };
  gameStorage.setItem(SAVE_KEY, JSON.stringify([
    slot,
    ...rawSaves.filter((save) => !isRecord(save) || Number(save.id) !== slot.id)
  ].slice(0, MAX_SAVES)));
  return slot;
}

export function deleteSave(id: number) {
  const rawSaves = parseArray(SAVE_KEY).filter((slot) => !isRecord(slot) || Number(slot.id) !== id);
  gameStorage.setItem(SAVE_KEY, JSON.stringify(rawSaves));
  return readSaveLibrary();
}

/**
 * Build an API config from build-time env vars (VITE_AI_*). These come from the
 * developer's shell environment (or .env.local) and provide a default so the game
 * does not require manual configuration on every launch. localStorage still wins
 * when the user explicitly saves a config in the UI.
 *
 * Required for non-empty config: VITE_AI_API_KEY.
 * Optional: VITE_AI_PROVIDER, VITE_AI_PROTOCOL, VITE_AI_ENDPOINT, VITE_AI_MODEL.
 */
export function getEnvDefaultApiConfig(): ApiConfig {
  const env = import.meta.env;
  return normalizeApiConfig({
    provider: isAiProvider(env.VITE_AI_PROVIDER) ? env.VITE_AI_PROVIDER : undefined,
    protocol: isAiProtocol(env.VITE_AI_PROTOCOL) ? env.VITE_AI_PROTOCOL : undefined,
    apiKey: env.VITE_AI_API_KEY ?? '',
    endpoint: env.VITE_AI_ENDPOINT ?? '',
    model: env.VITE_AI_MODEL ?? ''
  });
}

export function readApiConfig(): ApiConfig | null {
  try {
    const cfg = JSON.parse(gameStorage.getItem(API_KEY) || 'null') as ApiConfig | null;
    if (cfg && cfg.apiKey) {
      return normalizeApiConfig(cfg);
    }
  } catch {
    // fall through to env defaults
  }
  const envCfg = getEnvDefaultApiConfig();
  return envCfg.apiKey ? envCfg : null;
}

export function writeApiConfig(config: ApiConfig) {
  gameStorage.setItem(API_KEY, JSON.stringify(normalizeApiConfig(config)));
}

/**
 * Persist a config in two layers:
 *   1. Browser localStorage (synchronous, survives reloads in this browser).
 *   2. `.env.local` via the Vite dev-server middleware (`/__api_config`)
 *      — cross-browser, cross-machine-restart, since Vite reloads env vars on
 *      next boot. Silently no-ops in production builds.
 *
 * Returns true only when the env-write succeeded; false means the config is
 * stored in this browser only (including production and static preview).
 */
export async function persistApiConfig(config: ApiConfig): Promise<boolean> {
  writeApiConfig(config);
  await flushGameStorage();
  if (!import.meta.env.DEV) return false;
  try {
    const response = await fetch('/__api_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
      signal: AbortSignal.timeout(5_000)
    });
    return response.ok;
  } catch {
    // Dev server unreachable (e.g. running from a static preview). localStorage
    // already persisted the config, so we still consider this a soft success.
    return false;
  }
}
