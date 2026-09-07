import { describe, expect, it } from 'vitest';
import { createInitialGameState, gameReducer, hydrateGameState } from '../../src/state/gameReducer';
import { countCompletedGameTurns, getDmRequestTurn } from '../../src/services/turns';
import { validateToolCalls } from '../../src/dm/director';
import { inferStoryEventsFromActions, validateAuthoritativeNarratorSemantics } from '../../src/dm/turnGuards';
import { deriveRevealContext, getActiveKnowledgeBase } from '../../src/dm/knowledgeBase';
import { deriveWorkingMemory } from '../../src/dm/workingMemory';
import { makeInvestigator } from './fixtures';
import type { CheckContinuationAction, ConversationTurn, GameState } from '../../src/types/game';

const players = [makeInvestigator({ name: '亨利' }), makeInvestigator({ name: '艾达' })];
const history: ConversationTurn[] = Array.from({ length: 40 }, (_, index) => ({
  role: index % 2 ? 'assistant' : 'user', content: `turn-${index}`
}));
const kb = getActiveKnowledgeBase();

function investigationState() {
  return gameReducer(createInitialGameState(players), {
    type: 'applyAiResponse', raw: '{}', response: { stateUpdate: { storyEventIds: ['EV_ACCEPT_COMMISSION'] } }
  });
}

describe('long-session memory consistency', () => {
  it('keeps formal turn numbers stable through repeated compaction and loading', () => {
    let state = { ...createInitialGameState(players), conversationHistory: history };
    state = gameReducer(state, {
      type: 'consolidateMemory', summary: 'summary-1', summarizedUntilIndex: 0,
      sourceHistory: history, remainingHistory: history.slice(24)
    });
    expect(state.summarizedTurnCount).toBe(12);
    expect(deriveWorkingMemory(state, kb).turnCount).toBe(20);
    expect(getDmRequestTurn(state.conversationHistory, state.summarizedTurnCount)).toBe(21);
    const newHistory = [...state.conversationHistory, ...history];
    state = gameReducer({ ...state, conversationHistory: newHistory }, {
      type: 'consolidateMemory', summary: 'summary-2', summarizedUntilIndex: 0,
      sourceHistory: newHistory, remainingHistory: newHistory.slice(-16)
    });
    expect(deriveWorkingMemory(hydrateGameState(state), kb).turnCount).toBe(40);
  });

  it('rejects an overlapping stale summary without deleting newer turns', () => {
    const source1 = history.slice(0, 30);
    const source2 = history.slice(0, 34);
    const first = gameReducer({ ...createInitialGameState(players), conversationHistory: history }, {
      type: 'consolidateMemory', summary: 'current summary', summarizedUntilIndex: 0,
      sourceHistory: source1, remainingHistory: source1.slice(-16)
    });
    const afterStale = gameReducer(first, {
      type: 'consolidateMemory', summary: 'stale summary', summarizedUntilIndex: 0,
      sourceHistory: source2, remainingHistory: source2.slice(-16)
    });
    expect(afterStale).toBe(first);
    expect(afterStale.conversationHistory).toEqual(history.slice(14));
    expect(countCompletedGameTurns(afterStale.conversationHistory, afterStale.summarizedTurnCount)).toBe(20);
  });

  it('uses one turn id for the submitted action and its dice continuation', () => {
    expect(getDmRequestTurn([...history, { role: 'user', content: 'new action' }], 12)).toBe(33);
    expect(getDmRequestTurn([...history, { role: 'user', content: 'new action' },
      { role: 'assistant', content: 'roll' }, { role: 'user', content: '【检定结果】成功' }], 12)).toBe(33);
  });

  it('uses persisted scenario visits even after old event logs have been pruned', () => {
    const state = createInitialGameState(players);
    state.scenarioProgress.visitedSceneIds = ['S01', 'S03'];
    expect(deriveRevealContext(state).visitedScenes.has('S03')).toBe(true);
  });
});

describe('independent party check resolution', () => {
  const actions: CheckContinuationAction[] = [
    { player: '亨利', action: '检查抽屉里的合影照片' },
    { player: '艾达', action: '调查车库暗格里的白色粉末样品' },
    { player: '亨利', action: '【检定结果】亨利 的 侦查 检定：结果：普通成功（30）',
      checkResult: { skill: '侦查', outcome: 'success', targetItemIds: ['I02'] } },
    { player: '艾达', action: '【检定结果】艾达 的 医学 检定：结果：失败（90）',
      checkResult: { skill: '医学', outcome: 'fail', targetItemIds: ['I05'] } }
  ];

  it('accepts both a successful clue and a different failed clue in one round', () => {
    const state = investigationState();
    const proposals = inferStoryEventsFromActions(actions, state, kb);
    expect(proposals.map((call) => call.arguments.eventId)).toEqual(['EV_FIND_I02', 'EV_FAIL_I05']);
    const reviewed = validateToolCalls(proposals, { state, kb, actions });
    expect(reviewed.rejected).toEqual([]);
    const result = gameReducer(state, {
      type: 'applyAiResponse', raw: '{}', response: {
        stateUpdate: { storyEventIds: reviewed.accepted.map((call) => String(call.arguments.eventId)) }
      }
    });
    expect(result.scenarioProgress.knownFactIds).toContain('F05');
    expect(result.scenarioProgress.knownFactIds).not.toContain('F07');
    expect(result.clues.map((clue) => clue.id)).toEqual(expect.arrayContaining(['I02', 'I05']));
    expect(validateToolCalls([{ name: 'propose_story_event', arguments: { eventId: 'EV_FIND_I05' } }], { state, kb, actions }).accepted).toEqual([]);
  });

  it('matches mixed legacy result text to the corresponding investigator and skill', () => {
    const legacy = actions.map(({ checkResult: _check, ...action }) => action);
    const state = investigationState();
    const reviewed = validateToolCalls(inferStoryEventsFromActions(legacy, state, kb), { state, kb, actions: legacy });
    expect(reviewed.accepted).toHaveLength(2);
    expect(reviewed.rejected).toEqual([]);
  });

  it('allows narration to describe both outcomes of mixed party checks', () => {
    expect(validateAuthoritativeNarratorSemantics({
      narrative: '亨利的侦查检定成功。艾达的医学检定失败。', nextPrompt: '', playerChoices: {}
    }, [], investigationState(), kb, actions)).toBeNull();
    expect(validateAuthoritativeNarratorSemantics({
      narrative: '亨利的侦查检定失败。艾达的医学检定成功。', nextPrompt: '', playerChoices: {}
    }, [], investigationState(), kb, actions)).toMatch(/前端已经结算/);
  });

  it('keeps ending rewards identical when React or a continuation replays an action', () => {
    const state = investigationState();
    state.currentScene = 'S05';
    state.scenarioProgress.variables.finaleRoute = 'negotiation';
    state.scenarioProgress.firedEventIds.push('EV_NEGOTIATION_SUCCESS');
    state.players = state.players.map((player) => ({ ...player, currentSan: 20 }));
    const action = { type: 'applyAiResponse' as const, raw: '{}', response: {}, randomSeed: 0.7412 };
    const first = gameReducer(state, action);
    expect(first.scenarioProgress.endingId).toBe('END_C');
    expect(first.players[0].currentSan).toBeGreaterThan(20);
    for (let index = 0; index < 5; index++) {
      expect(gameReducer(state, action).players).toEqual(first.players);
    }
  });

  it('preserves roll metadata across saving the pending continuation', () => {
    const state = { ...createInitialGameState(players), pendingDmActions: actions };
    expect(hydrateGameState(JSON.parse(JSON.stringify(state))).pendingDmActions).toEqual(actions);
  });

  it('carries declarations and the listening result into authored persuasion', () => {
    const state = createInitialGameState(players);
    state.currentScene = 'S05';
    Object.assign(state.scenarioProgress.beatStates, { B01: 'completed', B02: 'completed', B05: 'completed', B06: 'active' });
    state.scenarioProgress.variables.finaleRoute = 'negotiation';
    const declaration = [{ player: '亨利', action: '尝试聆听他们的诉求' }];
    state.pendingCheck = { scenarioCheckId: 'CHECK_LISTEN', skill: '聆听', difficulty: '普通', player: '亨利', continuationActions: declaration };
    const resultAction = { player: '亨利', action: '【检定结果】聆听成功' };
    const next = gameReducer(state, { type: 'applyDiceResult', result: { roll: 10, level: 'hard', label: '困难成功' }, resultAction });
    expect(next.pendingCheck?.scenarioCheckId).toBe('CHECK_PERSUADE');
    expect(next.pendingCheck?.continuationActions).toEqual(declaration);
    expect(next.pendingCheck?.resolvedActions).toEqual([resultAction]);
  });

  it('does not age consequences on the check prelude', () => {
    const state = createInitialGameState(players);
    state.pendingConsequences = [{ id: 'danger', description: '脚步接近', triggerEvent: '来客抵达', remainingTurns: 2, scheduledAtTurn: 1 }];
    const waiting = gameReducer(state, { type: 'applyAiResponse', raw: '{}', response: {
      check: { skill: '侦查', player: '亨利', difficulty: '普通' }
    } });
    expect(waiting.pendingConsequences?.[0].remainingTurns).toBe(2);
    const finished = gameReducer(waiting, { type: 'applyAiResponse', raw: '{}', response: {} });
    expect(finished.pendingConsequences?.[0].remainingTurns).toBe(1);
  });

  it('ignores stray dice results and removes checks from an ended save', () => {
    const state = createInitialGameState(players);
    expect(gameReducer(state, { type: 'applyDiceResult', result: { roll: 10, level: 'hard', label: '成功' } })).toBe(state);
    state.scenarioProgress.endingId = 'END_A';
    state.pendingCheck = { skill: '侦查', player: '亨利', difficulty: '普通' };
    expect(hydrateGameState(state).pendingCheck).toBeNull();
  });

  it('does not accept inherited object names as saved scene ids', () => {
    expect(hydrateGameState({ ...createInitialGameState(players), currentScene: 'toString' } satisfies GameState).currentScene).toBe('S01');
  });
});
