import type { ApiConfig, GameState, SaveSlot } from '../types/game';

const SAVE_KEY = 'trpg-saves-v2';
const API_KEY = 'trpg-api';
const MAX_SAVES = 12;

export function readSaves(): SaveSlot[] {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]') as SaveSlot[];
  } catch {
    return [];
  }
}

export function saveGameState(gameState: GameState) {
  const saves = readSaves();
  const slot: SaveSlot = {
    id: Date.now(),
    savedAt: new Date().toLocaleString('zh-CN'),
    scene: gameState.currentScene,
    players: gameState.players.map((player) => player.name).join('、'),
    gameState
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify([slot, ...saves].slice(0, MAX_SAVES)));
  return slot;
}

export function deleteSave(id: number) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(readSaves().filter((slot) => slot.id !== id)));
}

export function readApiConfig(): ApiConfig | null {
  try {
    const cfg = JSON.parse(localStorage.getItem(API_KEY) || 'null') as ApiConfig | null;
    return cfg?.apiKey ? cfg : null;
  } catch {
    return null;
  }
}

export function writeApiConfig(config: ApiConfig) {
  localStorage.setItem(API_KEY, JSON.stringify(config));
}
