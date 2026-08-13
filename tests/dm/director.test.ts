import { describe, expect, it } from 'vitest';
import { allowedTools, validateToolCalls } from '../../src/dm/director';
import type { ClassifiedIntent } from '../../src/dm/intentClassifier';
import type { DmToolCall } from '../../src/dm/types';
import { wuzhongxiaoshi } from '../../src/data/scenarios/wuzhongxiaoshi';
import { createScenarioProgress } from '../../src/scenario/engine';
import { makeInvestigator, makeState } from './fixtures';

const kb = wuzhongxiaoshi;

function ctx(currentScene: 'S01' | 'S02' | 'S03' | 'S04' | 'S05' = 'S01') {
  const state = makeState({
    players: [makeInvestigator({ name: '亨利' }), makeInvestigator({ name: '艾达' })],
    currentScene
  });
  return { state, kb };
}

function intent(partial: Partial<ClassifiedIntent> = {}): ClassifiedIntent {
  return {
    relevantSkills: partial.relevantSkills ?? [],
    hasConflict: partial.hasConflict ?? false,
    hasMovement: partial.hasMovement ?? false,
    intentKind: partial.intentKind ?? 'other'
  };
}

describe('director.allowedTools', () => {
  it('always exposes baseline tools including structured story events', () => {
    const tools = allowedTools(ctx(), { intent: intent(), mode: 'together' });
    expect(tools).toEqual(
      expect.arrayContaining([
        'request_check',
        'propose_story_event',
        'propose_state_update',
        'reveal_secret',
        'lookup_entity',
        'schedule_consequence'
      ])
    );
    expect(tools).not.toContain('propose_scene_change');
  });

  it('grants propose_scene_change only in together + move/combat', () => {
    const t1 = allowedTools(ctx(), { intent: intent({ intentKind: 'move' }), mode: 'together' });
    expect(t1).toContain('propose_scene_change');

    const t2 = allowedTools(ctx(), { intent: intent({ intentKind: 'combat' }), mode: 'together' });
    expect(t2).toContain('propose_scene_change');

    const t3 = allowedTools(ctx(), { intent: intent({ intentKind: 'move' }), mode: 'split' });
    expect(t3).not.toContain('propose_scene_change');

    const t4 = allowedTools(ctx(), { intent: intent({ intentKind: 'social' }), mode: 'together' });
    expect(t4).not.toContain('propose_scene_change');

    const mixed = allowedTools(ctx(), {
      intent: intent({ intentKind: 'observe', hasMovement: true }),
      mode: 'together'
    });
    expect(mixed).toContain('propose_scene_change');
  });

  it('grants update_npc_mind only for interaction-heavy intents', () => {
    const social = allowedTools(ctx(), { intent: intent({ intentKind: 'social' }), mode: 'together' });
    const research = allowedTools(ctx(), { intent: intent({ intentKind: 'research' }), mode: 'together' });
    const combat = allowedTools(ctx(), { intent: intent({ intentKind: 'combat' }), mode: 'together' });
    const observe = allowedTools(ctx(), { intent: intent({ intentKind: 'observe' }), mode: 'together' });

    expect(social).toContain('update_npc_mind');
    expect(research).toContain('update_npc_mind');
    expect(combat).toContain('update_npc_mind');
    expect(observe).not.toContain('update_npc_mind');
  });
});

describe('director.validateToolCalls', () => {
  it('requires the authored failure event after a failed clue check', () => {
    const context = {
      ...ctx('S01'),
      actions: [{ action: '【检定结果】亨利的侦查检定：掷出84，结果：失败。' }]
    };
    context.state.scenarioProgress = createScenarioProgress();
    context.state.scenarioProgress.beatStates.B01 = 'completed';
    context.state.scenarioProgress.beatStates.B02 = 'active';

    const result = validateToolCalls([
      { name: 'propose_story_event', arguments: { eventId: 'EV_FIND_I01' } },
      { name: 'propose_story_event', arguments: { eventId: 'EV_FAIL_I01' } }
    ], context);

    expect(result.accepted.map((call) => call.arguments.eventId)).toEqual(['EV_FAIL_I01']);
    expect(result.rejected[0]?.reason).toMatch(/EV_FAIL_I01/);
  });

  it('rejects tool not in allowed set', () => {
    const calls: DmToolCall[] = [
      {
        name: 'propose_scene_change',
        arguments: { targetSceneId: 'S02' }
      }
    ];
    const result = validateToolCalls(calls, ctx(), [
      'request_check',
      'lookup_entity',
      'propose_state_update',
      'reveal_secret',
      'schedule_consequence'
    ]);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/不在允许集/);
  });

  it('rejects request_check with unknown player', () => {
    const calls: DmToolCall[] = [
      {
        name: 'request_check',
        arguments: { skill: '侦查', difficulty: '普通', player: '不存在的玩家' }
      }
    ];
    const result = validateToolCalls(calls, ctx());
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0].reason).toMatch(/不在玩家阵营/);
  });

  it('accepts request_check for valid player', () => {
    const calls: DmToolCall[] = [
      {
        name: 'request_check',
        arguments: { skill: '侦查', difficulty: '普通', player: '亨利', reason: '搜查' }
      }
    ];
    const result = validateToolCalls(calls, ctx());
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toEqual([]);
  });

  it('accepts only an authored event from the current active beat', () => {
    const accepted = validateToolCalls([
      { name: 'propose_story_event', arguments: { eventId: 'EV_FIND_I02', reason: '检查抽屉' } }
    ], ctx());
    expect(accepted.accepted).toHaveLength(1);

    const rejected = validateToolCalls([
      { name: 'propose_story_event', arguments: { eventId: 'EV_COMBAT_WIN' } }
    ], ctx());
    expect(rejected.accepted).toEqual([]);
    expect(rejected.rejected[0].reason).toMatch(/不属于当前活动节点|条件尚未满足/);
  });

  it('rejects propose_scene_change to non-adjacent scene', () => {
    const calls: DmToolCall[] = [
      { name: 'propose_scene_change', arguments: { targetSceneId: 'S05' } }
    ];
    // current scene = S01, S05 is only reachable from S04
    const result = validateToolCalls(calls, ctx('S01'));
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0].reason).toMatch(/不是.*的邻接场景/);
  });

  it('rejects a spatially adjacent scene while its story prerequisite is locked', () => {
    const calls: DmToolCall[] = [
      { name: 'propose_scene_change', arguments: { targetSceneId: 'S02' } }
    ];
    const result = validateToolCalls(calls, ctx('S01'));
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/不是|邻接/);
  });

  it('rejects reveal_secret with unknown id', () => {
    const calls: DmToolCall[] = [
      { name: 'reveal_secret', arguments: { secretId: 'totally_made_up' } }
    ];
    const result = validateToolCalls(calls, ctx());
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0].reason).toMatch(/未定义/);
  });

  it('rejects propose_state_update with hp for non-player', () => {
    const calls: DmToolCall[] = [
      {
        name: 'propose_state_update',
        arguments: { hp: { 不存在: -1 } }
      }
    ];
    const result = validateToolCalls(calls, ctx());
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0].reason).toMatch(/不在玩家阵营/);
  });

  it('rejects propose_state_update with newItems not in KB', () => {
    const calls: DmToolCall[] = [
      {
        name: 'propose_state_update',
        arguments: { newItems: ['I999'] }
      }
    ];
    const result = validateToolCalls(calls, ctx());
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0].reason).toMatch(/权威线索只能通过/);
  });

  it('accepts propose_state_update with valid hp delta and non-story flag', () => {
    const calls: DmToolCall[] = [
      {
        name: 'propose_state_update',
        arguments: {
          hp: { 亨利: -2 },
          flags: { met_montreal: true },
          newItems: []
        }
      }
    ];
    const result = validateToolCalls(calls, ctx());
    expect(result.accepted).toHaveLength(1);
  });

  it('rejects direct writes to declared scenario variables', () => {
    const result = validateToolCalls([{
      name: 'propose_state_update',
      arguments: { flags: { metMontreal: true } }
    }], ctx());
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0].reason).toContain('只能由模组 Effect 修改');
  });

  it('accepts schedule_consequence with proper shape', () => {
    const calls: DmToolCall[] = [
      {
        name: 'schedule_consequence',
        arguments: {
          id: 'thugs_arrive',
          description: '暴徒赶到 S04',
          remainingTurns: 3,
          triggerEvent: '调查员被埋伏在贝尔街'
        }
      }
    ];
    const result = validateToolCalls(calls, ctx());
    expect(result.accepted).toHaveLength(1);
  });

  it('rejects schedule_consequence with remainingTurns out of range', () => {
    const calls: DmToolCall[] = [
      {
        name: 'schedule_consequence',
        arguments: {
          id: 'too_long',
          description: '太久',
          remainingTurns: 99,
          triggerEvent: 'x'
        }
      }
    ];
    const result = validateToolCalls(calls, ctx());
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0].reason).toMatch(/remainingTurns/);
  });

  it('rejects lookup_entity for unknown id', () => {
    const calls: DmToolCall[] = [
      { name: 'lookup_entity', arguments: { kind: 'npc', id: '不存在' } }
    ];
    const result = validateToolCalls(calls, ctx());
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0].reason).toMatch(/NPC 不存在/);
  });

  it('accepts update_npc_mind for known NPC and known player exceptions', () => {
    const calls: DmToolCall[] = [
      {
        name: 'update_npc_mind',
        arguments: {
          npcId: '伊莎贝拉·摩勒',
          currentStance: '信任亨利但仍害怕',
          playerExceptions: { 亨利: '更愿意交谈' }
        }
      }
    ];
    const result = validateToolCalls(calls, ctx(), ['update_npc_mind']);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toEqual([]);
  });

  it('rejects update_npc_mind for unknown NPC or unknown player exception', () => {
    const badNpc = validateToolCalls(
      [{ name: 'update_npc_mind', arguments: { npcId: '不存在', currentStance: 'x' } }],
      ctx(),
      ['update_npc_mind']
    );
    expect(badNpc.accepted).toEqual([]);
    expect(badNpc.rejected[0].reason).toMatch(/未在 KB/);

    const badPlayer = validateToolCalls(
      [
        {
          name: 'update_npc_mind',
          arguments: {
            npcId: '伊莎贝拉·摩勒',
            currentStance: 'x',
            playerExceptions: { 不存在的玩家: 'x' }
          }
        }
      ],
      ctx(),
      ['update_npc_mind']
    );
    expect(badPlayer.accepted).toEqual([]);
    expect(badPlayer.rejected[0].reason).toMatch(/不在玩家阵营/);
  });
});
