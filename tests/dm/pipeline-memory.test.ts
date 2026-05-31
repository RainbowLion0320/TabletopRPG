import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDmTurn } from '../../src/dm/pipeline';
import type { ApiConfig, ConversationTurn } from '../../src/types/game';
import { makeInvestigator, makeState } from './fixtures';

const config: ApiConfig = {
  provider: 'openai',
  apiKey: 'unit-test-key',
  model: 'unit-test-model',
  endpoint: 'https://unit.test/v1'
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function bodyFrom(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
}

function systemText(body: Record<string, unknown>): string {
  const system = body.system;
  if (typeof system === 'string') return system;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const first = messages[0] as { content?: unknown } | undefined;
  return typeof first?.content === 'string' ? first.content : '';
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
          choices: [
            {
              message: {
                content: JSON.stringify({
                  facts: [
                    {
                      actor: '伊莎贝拉·摩勒',
                      predicate: 'stance_toward',
                      target: '亨利',
                      value: '信任'
                    }
                  ]
                })
              }
            }
          ]
        });
      }
      if (system.includes('COC 第七版 AI DM Agent')) {
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  narrative: '伊莎贝拉的语气软化，开始信任亨利。',
                  activeNpc: '伊莎贝拉·摩勒',
                  nextPrompt: '她等待你们继续询问。',
                  playerChoices: ['继续追问']
                }),
                tool_calls: []
              }
            }
          ]
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
        return jsonResponse({
          choices: [{ message: { content: JSON.stringify({ summary: '玩家已完成前情调查。' }) } }]
        });
      }
      if (system.includes('认知合成器')) {
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
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
                })
              }
            }
          ]
        });
      }
      if (system.includes('事实抽取助手')) {
        return jsonResponse({ choices: [{ message: { content: JSON.stringify({ facts: [] }) } }] });
      }
      if (system.includes('COC 第七版 AI DM Agent')) {
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  narrative: '她仍在等待你们的判断。',
                  activeNpc: '伊莎贝拉·摩勒',
                  nextPrompt: '继续行动。',
                  playerChoices: ['检查信件']
                }),
                tool_calls: []
              }
            }
          ]
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
});
