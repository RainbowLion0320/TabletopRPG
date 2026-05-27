import type { ApiConfig, GameState, SaveSlot } from '../types/game';
import { storyData } from '../data/storyData';
import { hydrateGameState } from '../state/gameReducer';

const SAVE_KEY = 'trpg-saves-v2';
const LEGACY_SAVE_KEY = 'trpg-saves';
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

  const fallbackPlayers = isRecord(value.character) ? [value.character] : [];
  const gameState = hydrateGameState(value.gameState, fallbackPlayers);
  if (!gameState.players.length) return null;

  const id = Number(value.id) || Date.now();
  const savedAt = typeof value.savedAt === 'string' && value.savedAt.trim()
    ? value.savedAt
    : new Date(id).toLocaleString('zh-CN');

  return {
    id,
    savedAt,
    scene: storyData.scenes[gameState.currentScene].name,
    players: gameState.players.map((player) => player.name).join('、'),
    gameState
  };
}

export function readSaves(): SaveSlot[] {
  const merged = [...parseArray(SAVE_KEY), ...parseArray(LEGACY_SAVE_KEY)]
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
    gameState: normalizedState
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify([slot, ...saves.filter((save) => save.id !== slot.id)].slice(0, MAX_SAVES)));
  return slot;
}

export function deleteSave(id: number) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(parseArray(SAVE_KEY).filter((slot) => !isRecord(slot) || Number(slot.id) !== id)));
  localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify(parseArray(LEGACY_SAVE_KEY).filter((slot) => !isRecord(slot) || Number(slot.id) !== id)));
}

export function readApiConfig(): ApiConfig | null {
  try {
    const cfg = JSON.parse(localStorage.getItem(API_KEY) || 'null') as (ApiConfig & { key?: string }) | null;
    if (!cfg) return null;
    const apiKey = cfg.apiKey || cfg.key || '';
    return apiKey ? { ...cfg, apiKey } : null;
  } catch {
    return null;
  }
}

export function writeApiConfig(config: ApiConfig) {
  localStorage.setItem(API_KEY, JSON.stringify(config));
}
