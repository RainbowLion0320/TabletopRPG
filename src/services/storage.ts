import type { ApiConfig, GameState, SaveSlot } from '../types/game';
import { isAiProtocol, isAiProvider, normalizeApiConfig } from '../config/aiConfig';
import { storyData } from '../data/storyData';
import { hydrateGameState } from '../state/gameReducer';

const SAVE_KEY = 'trpg-saves-v2';
const API_KEY = 'trpg-api';
const MAX_SAVES = 12;

function parseArray(key: string): unknown[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
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

  const id = Number(value.id) || Date.now();
  const savedAt = typeof value.savedAt === 'string' && value.savedAt.trim()
    ? value.savedAt
    : new Date(id).toLocaleString('zh-CN');

  const version: 1 | 2 | 3 | 4 | 5 =
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
    version
  };
}

export function readSaves(): SaveSlot[] {
  const merged = parseArray(SAVE_KEY)
    .flatMap((slot) => {
      const normalized = normalizeSaveSlot(slot);
      return normalized ? [normalized] : [];
    })
    .sort((a, b) => b.id - a.id);

  const deduped = new Map<number, SaveSlot>();
  merged.forEach((slot) => {
    if (!deduped.has(slot.id)) deduped.set(slot.id, slot);
  });

  return [...deduped.values()].slice(0, MAX_SAVES);
}

export function saveGameState(gameState: GameState) {
  const normalizedState = hydrateGameState(gameState);
  const saves = readSaves();
  const slot: SaveSlot = {
    id: Date.now(),
    savedAt: new Date().toLocaleString('zh-CN'),
    scene: storyData.scenes[normalizedState.currentScene].name,
    players: normalizedState.players.map((player) => player.name).join('、'),
    gameState: normalizedState,
    version: 5
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify([slot, ...saves.filter((save) => save.id !== slot.id)].slice(0, MAX_SAVES)));
  return slot;
}

export function deleteSave(id: number) {
  const saves = readSaves().filter((slot) => slot.id !== id);
  localStorage.setItem(SAVE_KEY, JSON.stringify(saves));
  return saves;
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
    const cfg = JSON.parse(localStorage.getItem(API_KEY) || 'null') as ApiConfig | null;
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
  localStorage.setItem(API_KEY, JSON.stringify(normalizeApiConfig(config)));
}

/**
 * Persist a config in three layers:
 *   1. Browser localStorage (synchronous, survives reloads in this browser).
 *   2. `.env.local` via the Vite dev-server middleware (`/__api_config`)
 *      — cross-browser, cross-machine-restart, since Vite reloads env vars on
 *      next boot. Silently no-ops in production builds.
 *
 * Returns true when the env-write succeeded (or was skipped in prod), false
 * when the dev middleware was reachable but rejected the payload.
 */
export async function persistApiConfig(config: ApiConfig): Promise<boolean> {
  writeApiConfig(config);
  if (!import.meta.env.DEV) return true;
  try {
    const response = await fetch('/__api_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return response.ok;
  } catch {
    // Dev server unreachable (e.g. running from a static preview). localStorage
    // already persisted the config, so we still consider this a soft success.
    return false;
  }
}
