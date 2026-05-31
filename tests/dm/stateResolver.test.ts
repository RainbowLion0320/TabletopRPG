import { describe, expect, it } from 'vitest';
import { resolveDmTurn } from '../../src/dm/stateResolver';
import type { DmToolCall } from '../../src/dm/types';
import type { NarratorOutput } from '../../src/dm/narrator';

function narrator(partial: Partial<NarratorOutput> = {}): NarratorOutput {
  return {
    raw: partial.raw ?? '',
    narrative: partial.narrative ?? '叙述',
    activeNpc: partial.activeNpc ?? null,
    nextPrompt: partial.nextPrompt ?? '',
    playerChoices: partial.playerChoices ?? [],
    toolCalls: partial.toolCalls ?? [],
    usedFunctionCalling: partial.usedFunctionCalling ?? true
  };
}

describe('stateResolver basics', () => {
  it('emits a narrative event even with no tool calls', () => {
    const { events, legacyResponse } = resolveDmTurn({
      narrator: narrator({ narrative: '雾气更浓了' }),
      acceptedCalls: [],
      turn: 1
    });
    expect(events.some((e) => e.kind === 'narrative')).toBe(true);
    expect(legacyResponse.narrative).toBe('雾气更浓了');
    expect(legacyResponse.stateUpdate?.scheduledConsequences).toEqual([]);
    expect(legacyResponse.stateUpdate?.triggeredConsequenceIds).toEqual([]);
  });

  it('extracts request_check (only first kept; multiple events)', () => {
    const calls: DmToolCall[] = [
      { name: 'request_check', arguments: { skill: '侦查', difficulty: '普通', player: '亨利' } },
      { name: 'request_check', arguments: { skill: '聆听', difficulty: '困难', player: '亨利' } }
    ];
    const { legacyResponse, events } = resolveDmTurn({
      narrator: narrator(),
      acceptedCalls: calls,
      turn: 2
    });
    expect(legacyResponse.check?.skill).toBe('侦查');
    expect(events.filter((e) => e.kind === 'check')).toHaveLength(2);
  });

  it('merges propose_state_update deltas across multiple calls', () => {
    const calls: DmToolCall[] = [
      { name: 'propose_state_update', arguments: { hp: { 亨利: -2 } } },
      { name: 'propose_state_update', arguments: { hp: { 亨利: -1 }, flags: { met_montreal: true } } }
    ];
    const { legacyResponse } = resolveDmTurn({
      narrator: narrator(),
      acceptedCalls: calls,
      turn: 3
    });
    expect(legacyResponse.stateUpdate?.hp).toEqual({ 亨利: -3 });
    expect(legacyResponse.stateUpdate?.flags).toEqual({ met_montreal: true });
  });

  it('reveal_secret writes flag secret.<id>.revealed = true', () => {
    const calls: DmToolCall[] = [
      { name: 'reveal_secret', arguments: { secretId: 'note_resentment', reason: '笔迹分析' } }
    ];
    const { legacyResponse, events } = resolveDmTurn({
      narrator: narrator(),
      acceptedCalls: calls,
      turn: 4
    });
    expect(legacyResponse.stateUpdate?.flags?.['secret.note_resentment.revealed']).toBe(true);
    expect(events.some((e) => e.kind === 'secret_reveal')).toBe(true);
  });

  it('schedule_consequence appends a fresh pending entry', () => {
    const calls: DmToolCall[] = [
      {
        name: 'schedule_consequence',
        arguments: {
          id: 'thugs',
          description: '暴徒到达',
          remainingTurns: 3,
          triggerEvent: '袭击调查员'
        }
      }
    ];
    const { legacyResponse } = resolveDmTurn({
      narrator: narrator(),
      acceptedCalls: calls,
      turn: 5
    });
    const scheduled = legacyResponse.stateUpdate?.scheduledConsequences ?? [];
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({
      id: 'thugs',
      remainingTurns: 3,
      scheduledAtTurn: 5,
      triggerEvent: '袭击调查员'
    });
  });

  it('schedule_consequence clamps remainingTurns into [1,10]', () => {
    const callsLow: DmToolCall[] = [
      {
        name: 'schedule_consequence',
        arguments: { id: 'a', description: 'x', remainingTurns: 0, triggerEvent: 'y' }
      }
    ];
    const { legacyResponse: low } = resolveDmTurn({
      narrator: narrator(),
      acceptedCalls: callsLow,
      turn: 1
    });
    expect(low.stateUpdate?.scheduledConsequences?.[0].remainingTurns).toBe(1);

    const callsHigh: DmToolCall[] = [
      {
        name: 'schedule_consequence',
        arguments: { id: 'b', description: 'x', remainingTurns: 99, triggerEvent: 'y' }
      }
    ];
    const { legacyResponse: high } = resolveDmTurn({
      narrator: narrator(),
      acceptedCalls: callsHigh,
      turn: 1
    });
    expect(high.stateUpdate?.scheduledConsequences?.[0].remainingTurns).toBe(10);
  });

  it('same id overwrites earlier scheduled entry within the same turn', () => {
    const calls: DmToolCall[] = [
      {
        name: 'schedule_consequence',
        arguments: { id: 'thugs', description: '初版', remainingTurns: 5, triggerEvent: 'x' }
      },
      {
        name: 'schedule_consequence',
        arguments: { id: 'thugs', description: '更新版', remainingTurns: 2, triggerEvent: 'x' }
      }
    ];
    const { legacyResponse } = resolveDmTurn({
      narrator: narrator(),
      acceptedCalls: calls,
      turn: 1
    });
    const scheduled = legacyResponse.stateUpdate?.scheduledConsequences ?? [];
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].description).toBe('更新版');
    expect(scheduled[0].remainingTurns).toBe(2);
  });

  it('triggers pendingBefore items whose remainingTurns drop to 0 or below', () => {
    const { legacyResponse, events } = resolveDmTurn({
      narrator: narrator(),
      acceptedCalls: [],
      turn: 7,
      pendingBefore: [
        {
          id: 'thugs',
          description: '暴徒',
          remainingTurns: 1,
          triggerEvent: '袭击',
          scheduledAtTurn: 5
        },
        {
          id: 'storm',
          description: '风暴',
          remainingTurns: 3,
          triggerEvent: '断电',
          scheduledAtTurn: 4
        }
      ]
    });
    expect(legacyResponse.stateUpdate?.triggeredConsequenceIds).toEqual(['thugs']);
    expect(events.some((e) => e.kind === 'consequence' && e.description.includes('袭击'))).toBe(true);
  });

  it('does not trigger pendingBefore items whose remainingTurns stay positive', () => {
    const { legacyResponse } = resolveDmTurn({
      narrator: narrator(),
      acceptedCalls: [],
      turn: 2,
      pendingBefore: [
        {
          id: 'long',
          description: 'x',
          remainingTurns: 5,
          triggerEvent: 'y',
          scheduledAtTurn: 1
        }
      ]
    });
    expect(legacyResponse.stateUpdate?.triggeredConsequenceIds).toEqual([]);
  });
});
