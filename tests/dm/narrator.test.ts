import { afterEach, describe, expect, it, vi } from 'vitest';
import { callNarrator } from '../../src/dm/narrator';
import type { DmContext } from '../../src/dm/contextBuilder';
import type { ApiConfig } from '../../src/types/game';

const config: ApiConfig = {
  provider: 'openai',
  apiKey: 'unit-test-key',
  model: 'unit-test-model',
  endpoint: 'https://unit.test/v1'
};

const ctx: DmContext = {
  static: {
    scenarioId: 'test',
    scenarioTitle: '测试模组',
    era: '1920s',
    rules: []
  },
  dynamic: {
    currentScene: {
      public: {
        id: 'S01',
        name: '雾港',
        desc: '码头被浓雾吞没。',
        image: '',
        npcs: [],
        items: []
      },
      knownSecrets: []
    },
    reachableScenes: [],
    npcs: [],
    items: [],
    playerLocations: { 亨利: '雾港' },
    knownClueNames: [],
    workingMemory: {
      turnCount: 0,
      visitedScenes: ['S01'],
      revealedSecrets: [],
      inScopeNpcIds: [],
      inScopeItemIds: [],
      pendingConsequences: [],
      npcStates: {}
    },
    retrievedMemories: [],
    spotlightPlayer: {
      name: '亨利',
      job: '调查员',
      hp: '12/12',
      san: '60/60',
      attrs: {
        STR: 60,
        CON: 60,
        SIZ: 50,
        DEX: 60,
        APP: 50,
        INT: 60,
        POW: 60,
        EDU: 60,
        Luck: 50
      },
      relevantSkills: {}
    },
    otherPlayers: []
  },
  recentTurns: [],
  summary: ''
};

function jsonResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      output_text: content,
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: content }]
        }
      ]
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

function bodyFrom(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('callNarrator retry repair', () => {
  it('uses a later valid narrator JSON object when the response contains an earlier non-final object', async () => {
    const content = [
      '中间草稿：{"note":"not final"}',
      JSON.stringify({
        narrative: '真正的叙事在后一个对象里。',
        activeNpc: null,
        nextPrompt: '继续调查。',
        playerChoices: ['检查窗户', '询问委托人', '查看信件']
      })
    ].join('\n');
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://unit.test/v1/responses');
      return jsonResponse(content);
    });
    vi.stubGlobal('fetch', fetchMock);

    const output = await callNarrator(config, {
      ctx,
      actions: [{ player: '亨利', action: '我检查窗户。' }],
      mode: 'together',
      history: []
    });

    expect(output.narrative).toBe('真正的叙事在后一个对象里。');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the malformed response and parse error back on the Responses retry', async () => {
    const malformed = '{\n  "narrative": "雾里传来"钟声"\n  "activeNpc": null\n}';
    const repaired = JSON.stringify({
      narrative: '雾里传来钟声。',
      activeNpc: null,
      nextPrompt: '你们要继续靠近码头吗？',
      playerChoices: ['靠近钟声', '原地观察', '询问同伴']
    });
    const requestBodies: Record<string, unknown>[] = [];

    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBodies.push(bodyFrom(init));
      return jsonResponse(requestBodies.length === 1 ? malformed : repaired);
    });
    vi.stubGlobal('fetch', fetchMock);

    const output = await callNarrator(config, {
      ctx,
      actions: [{ player: '亨利', action: '我向雾里的钟声走去。' }],
      mode: 'together',
      history: []
    });

    expect(output.narrative).toBe('雾里传来钟声。');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBodies[1].text).toMatchObject({
      format: { type: 'json_schema', name: 'narrator_response' }
    });

    const retryInput = requestBodies[1].input as Array<{ role?: string; content?: string }>;
    const repairMessage = retryInput.at(-1);
    expect(repairMessage?.role).toBe('user');
    expect(repairMessage?.content).toContain('Previous Narrator response was invalid JSON');
    expect(repairMessage?.content).toContain('Expected');
    expect(repairMessage?.content).toContain(malformed);
  });
});
