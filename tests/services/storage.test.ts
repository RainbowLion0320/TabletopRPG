import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioProgress } from '../../src/scenario/engine';
import {
  deleteSave,
  getEnvDefaultApiConfig,
  readApiConfig,
  readSaveLibrary,
  saveGameState
} from '../../src/services/storage';
import { makeState } from '../dm/fixtures';

const SAVE_KEY = 'trpg-saves-v2';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function rawSlot(id: number, moduleVersion: string, contentHash: string) {
  const gameState = makeState();
  gameState.scenarioProgress = createScenarioProgress();
  gameState.scenarioProgress.moduleVersion = moduleVersion;
  gameState.scenarioProgress.contentHash = contentHash;
  return {
    id,
    savedAt: '2026/8/14 09:00:00',
    scene: '摩勒住宅',
    players: gameState.players.map((player) => player.name).join('、'),
    gameState,
    version: 8
  };
}

describe('storage save compatibility', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('loads and migrates the 1.1.13 live-play save', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify([
      rawSlot(1, '1.1.13', '494364d4cfda2ab2')
    ]));

    const library = readSaveLibrary();

    expect(library.incompatible).toEqual([]);
    expect(library.saves).toHaveLength(1);
    expect(library.saves[0].gameState.scenarioProgress.moduleVersion).toBe('1.1.17');
  });

  it('keeps incompatible raw saves visible and preserves them when saving a new game', () => {
    const blocked = rawSlot(2, '9.9.9', 'unknown-content');
    localStorage.setItem(SAVE_KEY, JSON.stringify([blocked]));

    const before = readSaveLibrary();
    expect(before.saves).toEqual([]);
    expect(before.incompatible).toEqual([
      expect.objectContaining({ id: 2, scene: '摩勒住宅', reason: expect.stringContaining('没有到') })
    ]);

    saveGameState(makeState());
    const rawAfterSave = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '[]') as Array<{ id: number }>;
    expect(rawAfterSave.some((slot) => slot.id === 2)).toBe(true);
    expect(readSaveLibrary().saves).toHaveLength(1);
    expect(readSaveLibrary().incompatible).toHaveLength(1);

    const afterDelete = deleteSave(2);
    expect(afterDelete.incompatible).toEqual([]);
    expect(afterDelete.saves).toHaveLength(1);
  });
});

describe('AI API config storage', () => {
  it('reads provider, protocol, endpoint, key, and model from VITE_AI env defaults', () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'custom');
    vi.stubEnv('VITE_AI_PROTOCOL', 'chat-completions');
    vi.stubEnv('VITE_AI_ENDPOINT', 'https://gateway.example/v1');
    vi.stubEnv('VITE_AI_API_KEY', 'env-key');
    vi.stubEnv('VITE_AI_MODEL', 'gateway-model');

    expect(getEnvDefaultApiConfig()).toEqual({
      provider: 'custom',
      protocol: 'chat-completions',
      endpoint: 'https://gateway.example/v1',
      apiKey: 'env-key',
      model: 'gateway-model'
    });
  });

  it('preserves explicit localStorage provider, protocol, endpoint, and model fields', () => {
    localStorage.setItem('trpg-api', JSON.stringify({
      provider: 'mimo',
      protocol: 'chat-completions',
      endpoint: 'https://mimo.example/v1',
      apiKey: 'saved-key',
      model: 'mimo-v2.5'
    }));

    expect(readApiConfig()).toEqual({
      provider: 'mimo',
      protocol: 'chat-completions',
      endpoint: 'https://mimo.example/v1',
      apiKey: 'saved-key',
      model: 'mimo-v2.5'
    });
  });

  it('normalizes legacy saved configs to OpenAI Responses defaults', () => {
    localStorage.setItem('trpg-api', JSON.stringify({
      provider: 'openai',
      apiKey: 'legacy-key',
      model: ''
    }));

    expect(readApiConfig()).toEqual({
      provider: 'openai',
      protocol: 'responses',
      endpoint: 'https://api.openai.com/v1',
      apiKey: 'legacy-key',
      model: 'gpt-4o'
    });
  });
});
