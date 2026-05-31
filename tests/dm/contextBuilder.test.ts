import { describe, expect, it } from 'vitest';
import { buildDmContext } from '../../src/dm/contextBuilder';
import { wuzhongxiaoshi } from '../../src/data/scenarios/wuzhongxiaoshi';
import type { ConversationTurn } from '../../src/types/game';
import { makeInvestigator, makeState } from './fixtures';

const kb = wuzhongxiaoshi;

describe('contextBuilder', () => {
  it('puts the spotlight on the checkPlayer with full skill view', () => {
    const henry = makeInvestigator(
      { name: '亨利' },
      { 侦查: 75, 聆听: 65, 心理学: 70 }
    );
    const ada = makeInvestigator({ name: '艾达' }, { 急救: 80 });
    const state = makeState({ players: [henry, ada], currentScene: 'S01' });

    const ctx = buildDmContext(state, kb, {
      mode: 'together',
      checkPlayer: '亨利',
      relevantSkills: ['侦查', '聆听']
    });

    expect(ctx.dynamic.spotlightPlayer).not.toBeNull();
    expect(ctx.dynamic.spotlightPlayer!.name).toBe('亨利');
    // Only the requested relevantSkills are exposed (with totals)
    expect(Object.keys(ctx.dynamic.spotlightPlayer!.relevantSkills).sort()).toEqual(['侦查', '聆听']);
    expect(ctx.dynamic.spotlightPlayer!.relevantSkills['侦查']).toBe(75);
    expect(ctx.dynamic.spotlightPlayer!.relevantSkills['聆听']).toBe(65);

    // Other player(s) appear in lite form (no attrs / no skills)
    expect(ctx.dynamic.otherPlayers).toHaveLength(1);
    expect(ctx.dynamic.otherPlayers[0].name).toBe('艾达');
    expect((ctx.dynamic.otherPlayers[0] as unknown as Record<string, unknown>).attrs).toBeUndefined();
  });

  it('falls back to no spotlight when checkPlayer is unset', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' }), makeInvestigator({ name: '艾达' })]
    });
    const ctx = buildDmContext(state, kb, { mode: 'together' });
    expect(ctx.dynamic.spotlightPlayer).toBeNull();
    expect(ctx.dynamic.otherPlayers).toHaveLength(2);
  });

  it('truncates conversation history to recentTurnWindow', () => {
    const history: ConversationTurn[] = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `turn-${i}`
    }));
    const state = makeState({ conversationHistory: history });
    const ctx = buildDmContext(state, kb, { mode: 'together' }, { recentTurnWindow: 6 });
    expect(ctx.recentTurns).toHaveLength(6);
    expect(ctx.recentTurns[0].content).toBe('turn-24');
    expect(ctx.recentTurns[5].content).toBe('turn-29');
  });

  it('includes scene snapshot, reachable scenes, and player locations', () => {
    const state = makeState({ currentScene: 'S01' });
    const ctx = buildDmContext(state, kb, { mode: 'together' });
    expect(ctx.dynamic.currentScene.public.id).toBe('S01');
    expect(ctx.dynamic.reachableScenes.map((s) => s.id).sort()).toEqual(['S02', 'S03', 'S04']);
    // single default fixture player should be located in S01
    const playerName = state.players[0].name;
    expect(ctx.dynamic.playerLocations[playerName]).toBe('摩勒住宅');
  });

  it('exposes summary from state when not overridden', () => {
    const state = makeState();
    state.longTermMemorySummary = 'previous summary';
    const ctx = buildDmContext(state, kb, { mode: 'together' });
    expect(ctx.summary).toBe('previous summary');

    const ctxOverride = buildDmContext(state, kb, { mode: 'together' }, { summary: 'override' });
    expect(ctxOverride.summary).toBe('override');
  });

  it('working memory contains pendingConsequences derived from state', () => {
    const state = makeState({
      pendingConsequences: [
        {
          id: 'thugs',
          description: '暴徒赶到',
          remainingTurns: 2,
          triggerEvent: '伏击',
          scheduledAtTurn: 1
        }
      ]
    });
    const ctx = buildDmContext(state, kb, { mode: 'together' });
    expect(ctx.dynamic.workingMemory.pendingConsequences).toHaveLength(1);
    expect(ctx.dynamic.workingMemory.pendingConsequences[0].id).toBe('thugs');
    expect(ctx.dynamic.workingMemory.pendingConsequences[0].remainingTurns).toBe(2);
  });

  it('enriches in-scope NPCs with mind data and scoped prospective intents', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' })],
      currentScene: 'S01'
    });
    state.atomicFacts = [
      {
        id: 'f_1_0',
        turn: 1,
        actor: '伊莎贝拉·摩勒',
        predicate: 'stance_toward',
        target: '亨利',
        value: '警惕',
        source: 'system1'
      },
      {
        id: 'f_2_0',
        turn: 2,
        actor: '伊莎贝拉·摩勒',
        predicate: 'stance_toward',
        target: '亨利',
        value: '信任',
        supersedes: 'f_1_0',
        source: 'system1'
      }
    ];
    state.npcMindModels = {
      '伊莎贝拉·摩勒': {
        npcId: '伊莎贝拉·摩勒',
        coreMotivation: '找回父亲',
        currentStance: '愿意有限合作',
        stanceHistoryFactIds: ['f_1_0', 'f_2_0'],
        lastUpdatedTurn: 2
      }
    };
    state.prospectiveIntents = [
      {
        id: 'i_scope',
        owner: '伊莎贝拉·摩勒',
        predictedAction: '递出父亲信件',
        triggerCondition: '调查员继续安抚',
        ttl: 3,
        createdTurn: 2
      },
      {
        id: 'i_world',
        owner: 'world',
        predictedAction: '窗外雾声加重',
        triggerCondition: '下一次停顿',
        ttl: 1,
        createdTurn: 2
      },
      {
        id: 'i_other',
        owner: '洛夫·蒙特利尔',
        predictedAction: '派人盯梢',
        triggerCondition: '调查员离开警局',
        ttl: 3,
        createdTurn: 2
      },
      {
        id: 'i_expired',
        owner: '伊莎贝拉·摩勒',
        predictedAction: '过期意图',
        triggerCondition: '不会触发',
        ttl: 0,
        createdTurn: 1
      }
    ];

    const ctx = buildDmContext(state, kb, { mode: 'together' });
    const isabella = ctx.dynamic.npcs.find((n) => n.public.name === '伊莎贝拉·摩勒');

    expect(isabella?.mindModel?.coreMotivation).toBe('找回父亲');
    expect(isabella?.recentFacts?.map((f) => f.id)).toEqual(['f_2_0', 'f_1_0']);
    expect(isabella?.stanceChain?.map((f) => f.value)).toEqual(['警惕', '信任']);
    expect(ctx.dynamic.workingMemory.prospectiveIntents?.map((i) => i.id).sort()).toEqual([
      'i_scope',
      'i_world'
    ]);
  });
});
