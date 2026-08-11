import { afterEach, describe, expect, it, vi } from 'vitest';
import { callNarrator } from '../../src/dm/narrator';
import type { DmContext } from '../../src/dm/contextBuilder';
import type { ApiConfig } from '../../src/types/game';

const config: ApiConfig = {
  provider: 'openai',
  protocol: 'responses',
  apiKey: 'unit-test-key',
  model: 'unit-test-model',
  endpoint: 'https://unit.test/v1'
};

const ctx: DmContext = {
  static: {
    scenarioId: 'test',
    scenarioTitle: '测试模组',
    era: '1920s',
    rules: [],
    npcDirectory: []
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
        playerChoices: {
          亨利: ['检查窗户', '询问委托人', '查看信件']
        }
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
    expect(output.playerChoices).toEqual({
      亨利: ['检查窗户', '询问委托人', '查看信件']
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('repairs unescaped dialogue quotes locally without another model request', async () => {
    const malformed = '{"narrative":"老人说什么"水里的东西"，随后闭口不言。","activeNpc":null,"nextPrompt":"继续追问吗？","playerChoices":{"亨利":["追问细节"]}}';
    const fetchMock = vi.fn(async () => jsonResponse(malformed));
    vi.stubGlobal('fetch', fetchMock);

    const output = await callNarrator(config, {
      ctx,
      actions: [{ player: '亨利', action: '追问他看见了什么。' }],
      mode: 'together',
      history: []
    });

    expect(output.narrative).toBe('老人说什么"水里的东西"，随后闭口不言。');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('repairs several unescaped quoted fragments in narrative and choices', async () => {
    const malformed = '{"narrative":"照片背面写着"1915，马赛港，R.M.与E.M."。伊莎贝拉说："我不确定。"","activeNpc":"伊莎贝拉·摩勒","nextPrompt":"继续调查。","playerChoices":{"亨利":["追问她为何觉得"不对劲"，确认细节"],"艾达":["检查照片"]}}';
    const fetchMock = vi.fn(async () => jsonResponse(malformed));
    vi.stubGlobal('fetch', fetchMock);

    const output = await callNarrator(config, {
      ctx,
      actions: [{ player: '亨利', action: '检查照片。' }],
      mode: 'together',
      history: []
    });

    expect(output.narrative).toContain('"1915，马赛港，R.M.与E.M."');
    expect(output.playerChoices.亨利[0]).toContain('"不对劲"');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends a response that local repair cannot validate back on the Responses retry', async () => {
    const malformed = 'not a narrator json object';
    const repaired = JSON.stringify({
      narrative: '雾里传来钟声。',
      activeNpc: null,
      nextPrompt: '你们要继续靠近码头吗？',
      playerChoices: {
        亨利: ['靠近钟声', '原地观察', '询问同伴']
      }
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
    expect(repairMessage?.content).toContain('本地修复后的 JSON 缺少 Narrator 必填字段');
    expect(repairMessage?.content).toContain(malformed);
  });

  it('accepts chat-compatible response content through the Chat Completions adapter', async () => {
    const chatConfig: ApiConfig = {
      provider: 'custom',
      protocol: 'chat-completions',
      apiKey: 'unit-test-key',
      model: 'unit-test-model',
      endpoint: 'https://unit.test/v1'
    };
    const content = JSON.stringify({
      narrative: '兼容响应已解析。',
      activeNpc: null,
      nextPrompt: '你要继续检查码头吗？',
      playerChoices: {
        亨利: ['检查脚印', '呼喊同伴', '返回灯塔']
      }
    });
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://unit.test/v1/chat/completions');
      const body = bodyFrom(init);
      expect(body.messages).toEqual([
        expect.objectContaining({ role: 'system' }),
        {
          role: 'user',
          content: expect.stringContaining('【本轮行动宣言】\n亨利：我查看码头地面。')
        }
      ]);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: 'assistant', content }
            }
          ]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const output = await callNarrator(chatConfig, {
      ctx,
      actions: [{ player: '亨利', action: '我查看码头地面。' }],
      mode: 'together',
      history: []
    });

    expect(output.narrative).toBe('兼容响应已解析。');
    expect(output.playerChoices).toEqual({
      亨利: ['检查脚印', '呼喊同伴', '返回灯塔']
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('silently drops invalid keywords without retrying the Narrator', async () => {
    const content = JSON.stringify({
      narrative: '老人低声提到水里的东西。',
      activeNpc: null,
      nextPrompt: '要继续追问吗？',
      playerChoices: { 亨利: ['追问细节', '观察神情'] },
      keywords: [
        { text: '水里的东西', kind: 'clue' },
        { text: '<script>', kind: 'danger' },
        { text: '正文没有这句话', kind: 'state' },
        { text: '老人', kind: 'person' }
      ]
    });
    const fetchMock = vi.fn(async () => jsonResponse(content));
    vi.stubGlobal('fetch', fetchMock);

    const output = await callNarrator(config, {
      ctx,
      actions: [{ player: '亨利', action: '继续追问。' }],
      mode: 'together',
      history: []
    });

    expect(output.keywords).toEqual([{ text: '水里的东西', kind: 'clue' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a diagnostic configuration error when chat-compatible protocol has no endpoint', async () => {
    const badConfig: ApiConfig = {
      provider: 'custom',
      protocol: 'chat-completions',
      apiKey: 'unit-test-key',
      model: 'unit-test-model'
    };

    await expect(callNarrator(badConfig, {
      ctx,
      actions: [{ player: '亨利', action: '我查看码头地面。' }],
      mode: 'together',
      history: []
    })).rejects.toThrow(/endpoint|协议|模型|chat-compatible/i);
  });
});
