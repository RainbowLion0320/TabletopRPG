import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDmTurn } from '../../src/dm/pipeline';
import type { ApiConfig, ConversationTurn } from '../../src/types/game';
import { makeInvestigator, makeState } from './fixtures';

const config: ApiConfig = {
  provider: 'openai',
  protocol: 'responses',
  apiKey: 'unit-test-key',
  model: 'unit-test-model',
  endpoint: 'https://unit.test/v1'
};

function jsonResponse(body: unknown): Response {
  const content = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(JSON.stringify({
    output_text: content,
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: content }]
      }
    ]
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function bodyFrom(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
}

function systemText(body: Record<string, unknown>): string {
  return typeof body.instructions === 'string' ? body.instructions : '';
}

function makeHistoryPairs(count: number): ConversationTurn[] {
  return Array.from({ length: count * 2 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `history-${index}`
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runDmTurn cognitive memory outputs', () => {
  it('returns System1 facts extracted from the resolved turn narrative', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = bodyFrom(init);
      const system = systemText(body);
      if (system.includes('事实抽取助手')) {
        return jsonResponse({
          facts: [
            {
              actor: '伊莎贝拉·摩勒',
              predicate: 'stance_toward',
              target: '亨利',
              value: '信任'
            }
          ]
        });
      }
      if (system.includes('COC 第七版 AI DM Agent')) {
        return jsonResponse({
          narrative: '伊莎贝拉的语气软化，开始信任亨利。',
          activeNpc: '伊莎贝拉·摩勒',
          nextPrompt: '她等待你们继续询问。',
          playerChoices: ['继续追问']
        });
      }
      throw new Error(`unexpected prompt: ${system.slice(0, 80)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const state = makeState({
      players: [makeInvestigator({ name: '亨利' })],
      currentScene: 'S01'
    });

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '亨利', action: '安抚伊莎贝拉，询问父亲的信件。' }]
    });

    expect(output.legacyResponse.narrative).toContain('信任亨利');
    expect(output.factsToAppend).toEqual([
      expect.objectContaining({
        id: 'f_1_0',
        turn: 1,
        actor: '伊莎贝拉·摩勒',
        predicate: 'stance_toward',
        target: '亨利',
        value: '信任',
        source: 'system1'
      })
    ]);
    expect(output.decayIntents).toBe(true);
  });

  it('returns System2 mind updates and prospective intents on the consolidation cadence', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = bodyFrom(init);
      const system = systemText(body);
      if (system.includes('压缩为一段 200-400 字')) {
        return jsonResponse({ summary: '玩家已完成前情调查。' });
      }
      if (system.includes('认知合成器')) {
        return jsonResponse({
          npcMindModels: {
            '伊莎贝拉·摩勒': {
              coreMotivation: '找到父亲',
              currentStance: '信任亨利',
              playerExceptions: { 亨利: '更愿意透露家事' }
            }
          },
          prospectiveIntents: [
            {
              owner: '伊莎贝拉·摩勒',
              predictedAction: '主动交出父亲信件',
              triggerCondition: '调查员继续安抚'
            }
          ]
        });
      }
      if (system.includes('事实抽取助手')) {
        return jsonResponse({ facts: [] });
      }
      if (system.includes('COC 第七版 AI DM Agent')) {
        return jsonResponse({
          narrative: '她仍在等待你们的判断。',
          activeNpc: '伊莎贝拉·摩勒',
          nextPrompt: '继续行动。',
          playerChoices: ['检查信件']
        });
      }
      throw new Error(`unexpected prompt: ${system.slice(0, 80)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const state = makeState({
      players: [makeInvestigator({ name: '亨利' })],
      currentScene: 'S01',
      conversationHistory: makeHistoryPairs(14)
    });
    state.atomicFacts = [
      {
        id: 'f_14_0',
        turn: 14,
        actor: '伊莎贝拉·摩勒',
        predicate: 'stance_toward',
        target: '亨利',
        value: '逐渐信任',
        source: 'system1'
      }
    ];

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '亨利', action: '继续安抚伊莎贝拉。' }]
    });

    expect(output.memoryUpdate?.summary).toBe('玩家已完成前情调查。');
    expect(output.mindUpdates).toEqual([
      {
        npcId: '伊莎贝拉·摩勒',
        partial: {
          coreMotivation: '找到父亲',
          currentStance: '信任亨利',
          playerExceptions: { 亨利: '更愿意透露家事' },
          lastUpdatedTurn: 15
        }
      }
    ]);
    expect(output.prospectiveIntentsToAdd).toEqual([
      expect.objectContaining({
        id: 'i_15_0',
        owner: '伊莎贝拉·摩勒',
        predictedAction: '主动交出父亲信件',
        triggerCondition: '调查员继续安抚',
        ttl: 6,
        createdTurn: 15
      })
    ]);
  });

  it('injects retrieved episodic memories and returns a new episode record', async () => {
    const systemPrompts: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = bodyFrom(init);
      const system = systemText(body);
      systemPrompts.push(system);
      if (system.includes('事实抽取助手')) {
        return jsonResponse({
          facts: [
            {
              actor: '伊莎贝拉·摩勒',
              predicate: 'knowledge',
              value: '愿意交出父亲信件'
            }
          ]
        });
      }
      if (system.includes('COC 第七版 AI DM Agent')) {
        return jsonResponse({
          narrative: '伊莎贝拉记起先前的承诺，取出父亲的私人信件。',
          activeNpc: '伊莎贝拉·摩勒',
          nextPrompt: '信件摊在桌上。',
          playerChoices: ['阅读信件']
        });
      }
      throw new Error(`unexpected prompt: ${system.slice(0, 80)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const state = makeState({
      players: [makeInvestigator({ name: '亨利' })],
      currentScene: 'S01'
    });
    state.episodicMemory = [
      {
        id: 'em_prev',
        turn: 1,
        sceneId: 'S01',
        text: '伊莎贝拉曾答应亨利，只要他继续帮助寻找父亲，就会交出父亲的私人信件。',
        playerNames: ['亨利'],
        entityIds: ['伊莎贝拉·摩勒'],
        tags: ['承诺'],
        source: 'episode',
        visibility: 'dm',
        importance: 3
      }
    ];

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '亨利', action: '我提醒伊莎贝拉上次答应过交出信件。' }]
    });

    const narratorPrompt = systemPrompts.find((prompt) => prompt.includes('COC 第七版 AI DM Agent')) ?? '';
    expect(narratorPrompt).toContain('相关历史片段');
    expect(narratorPrompt).toContain('交出父亲的私人信件');
    expect(output.episodicMemoriesToAdd).toEqual([
      expect.objectContaining({
        turn: 1,
        sceneId: 'S01',
        source: 'episode',
        visibility: 'dm'
      })
    ]);
    expect(output.episodicMemoriesToAdd?.[0].text).toContain('伊莎贝拉记起先前的承诺');
  });

  it('returns an AI-proposed dynamic case board patch after events and facts are available', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = bodyFrom(init);
      const system = systemText(body);
      if (system.includes('事实抽取助手')) {
        return jsonResponse({
          facts: [
            {
              actor: '伊莎贝拉·摩勒',
              predicate: 'knowledge',
              value: '回避父亲债务'
            }
          ]
        });
      }
      if (system.includes('案件板合成助手')) {
        return jsonResponse({
          nodes: [
            {
              id: 'ai-isabella-debt',
              type: 'theory',
              title: '伊莎贝拉回避债务问题',
              subtitle: '来自本轮对话',
              source: 'ai',
              certainty: 'hypothesis',
              sourceFactIds: ['f_1_0'],
              sourceEventIds: [],
              sourceClueIds: [],
              createdTurn: 1,
              updatedTurn: 1,
              status: 'active'
            }
          ],
          edges: []
        });
      }
      if (system.includes('COC 第七版 AI DM Agent')) {
        return jsonResponse({
          narrative: '伊莎贝拉避开了关于债务的问题。',
          activeNpc: '伊莎贝拉·摩勒',
          nextPrompt: '她等待下一问。',
          playerChoices: ['追问债务']
        });
      }
      throw new Error(`unexpected prompt: ${system.slice(0, 80)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const state = makeState({
      players: [makeInvestigator({ name: '亨利' })],
      currentScene: 'S01'
    });

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '亨利', action: '追问伊莎贝拉是否隐瞒债务。' }]
    });

    expect(output.legacyResponse?.narrative).toContain('债务');
    expect(output.caseBoardPatch).toEqual({
      nodes: [
        expect.objectContaining({
          id: 'ai-isabella-debt',
          title: '伊莎贝拉回避债务问题',
          certainty: 'hypothesis',
          sourceFactIds: ['f_1_0']
        })
      ],
      edges: []
    });
  });

  it('keeps the DM turn usable when case board synthesis returns malformed JSON', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = bodyFrom(init);
      const system = systemText(body);
      if (system.includes('事实抽取助手')) {
        return jsonResponse({ facts: [] });
      }
      if (system.includes('案件板合成助手')) {
        return jsonResponse('not json');
      }
      if (system.includes('COC 第七版 AI DM Agent')) {
        return jsonResponse({
          narrative: '调查继续推进。',
          activeNpc: null,
          nextPrompt: '继续行动。',
          playerChoices: ['检查书房']
        });
      }
      throw new Error(`unexpected prompt: ${system.slice(0, 80)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const state = makeState({
      players: [makeInvestigator({ name: '亨利' })],
      currentScene: 'S01'
    });

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '亨利', action: '检查书房。' }]
    });

    expect(output.legacyResponse?.narrative).toBe('调查继续推进。');
    expect(output.caseBoardPatch).toEqual({ nodes: [], edges: [] });
  });
});
