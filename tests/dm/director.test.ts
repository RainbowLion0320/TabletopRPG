import { describe, expect, it } from 'vitest';
import { allowedTools, validateToolCalls } from '../../src/dm/director';
import type { ClassifiedIntent } from '../../src/dm/intentClassifier';
import type { DmToolCall } from '../../src/dm/types';
import { wuzhongxiaoshi } from '../../src/data/scenarios/wuzhongxiaoshi';
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
    intentKind: partial.intentKind ?? 'other'
  };
}

describe('director.allowedTools', () => {
  it('always exposes baseline tools (5)', () => {
    const tools = allowedTools(ctx(), { intent: intent(), mode: 'together' });
    expect(tools).toEqual(
      expect.arrayContaining([
        'request_check',
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
  });
});

describe('director.validateToolCalls', () => {
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

  it('rejects propose_scene_change to non-adjacent scene', () => {
    const calls: DmToolCall[] = [
      { name: 'propose_scene_change', arguments: { targetSceneId: 'S05' } }
    ];
    // current scene = S01, S05 is only reachable from S04
    const result = validateToolCalls(calls, ctx('S01'));
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0].reason).toMatch(/不是.*的邻接场景/);
  });

  it('accepts propose_scene_change to adjacent scene', () => {
    const calls: DmToolCall[] = [
      { name: 'propose_scene_change', arguments: { targetSceneId: 'S02' } }
    ];
    const result = validateToolCalls(calls, ctx('S01'));
    expect(result.accepted).toHaveLength(1);
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
    expect(result.rejected[0].reason).toMatch(/物品 id 未在 KB/);
  });

  it('accepts propose_state_update with valid hp delta + flag + known item', () => {
    const calls: DmToolCall[] = [
      {
        name: 'propose_state_update',
        arguments: {
          hp: { 亨利: -2 },
          flags: { met_montreal: true },
          newItems: ['I01']
        }
      }
    ];
    const result = validateToolCalls(calls, ctx());
    expect(result.accepted).toHaveLength(1);
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
});
