import { describe, expect, it } from 'vitest';
import { createInitialGameState, gameReducer, hydrateGameState } from '../../src/state/gameReducer';
import { inferNarrativeConsequences, validateAuthoritativeNarratorSemantics } from '../../src/dm/turnGuards';
import { getActiveKnowledgeBase } from '../../src/dm/knowledgeBase';
import { validateToolCalls } from '../../src/dm/director';
import { getSettledResourceDelta } from '../../src/services/checkSettlement';
import { makeInvestigator } from '../dm/fixtures';
import type { CheckContinuationAction } from '../../src/types/game';

function settledCombatFumble() {
  const state = createInitialGameState([makeInvestigator({ name: '亨利' })]);
  state.currentScene = 'S05';
  state.scenarioProgress.beatStates.B01 = 'completed';
  state.scenarioProgress.beatStates.B02 = 'completed';
  state.scenarioProgress.beatStates.B05 = 'completed';
  state.scenarioProgress.beatStates.B06 = 'active';
  state.scenarioProgress.variables.finaleRoute = 'combat';
  state.scenarioProgress.variables.combatRoundStarted = true;
  state.scenarioProgress.encounters.ENC01.state = 'active';
  state.scenarioProgress.clocks.fusangEscape = { value: 2, active: true, visible: true };
  state.pendingCheck = { scenarioCheckId: 'CHECK_COMBAT', player: '亨利', skill: '格斗（拳）', difficulty: '普通' };
  return gameReducer(state, { type: 'applyDiceResult', result: { roll: 100, level: 'fumble', label: '大失败（100）' } });
}

const actions: CheckContinuationAction[] = [{
  player: '亨利', action: '【检定结果】亨利 的 格斗（拳） 检定：结果：大失败（100）。',
  checkResult: { skill: '格斗（拳）', outcome: 'fumble', settledResources: { hp: -1 } }
}];
const narrative = '亨利的手臂受伤，退回掩体。甲板上的敌人仍在抵抗。';

describe('deep audit resource settlement', () => {
  it('lets the DM narrate a combat fumble injury already settled by the rules without requesting another HP update', () => {
    const state = settledCombatFumble();
    expect(state.players[0].currentHp).toBe(state.players[0].hp - 1);
    expect(validateAuthoritativeNarratorSemantics({ narrative, nextPrompt: '', playerChoices: {} }, [], state, getActiveKnowledgeBase(), actions)).toBeNull();
  });

  it('does not infer a second injury when narrating the same authored fumble', () => {
    const state = settledCombatFumble();
    const response = inferNarrativeConsequences({ narrative }, actions, state);
    const next = gameReducer(state, { type: 'applyAiResponse', response, raw: JSON.stringify(response) });
    expect(next.players[0].currentHp).toBe(state.players[0].currentHp);
  });

  it('does not charge damage when first aid has stopped an existing wound from bleeding', () => {
    const state = createInitialGameState([makeInvestigator({ name: '亨利', currentHp: 9 })]);
    const text = '亨利按住伤口，包扎后他的手臂已经不再流血，可以继续调查。';
    const healingActions = [{ player: '亨利', action: '包扎手臂上已经受伤的地方' }];
    expect(validateAuthoritativeNarratorSemantics({ narrative: text, nextPrompt: '', playerChoices: {} }, [], state, getActiveKnowledgeBase(), healingActions)).toBeNull();
    expect(inferNarrativeConsequences({ narrative: text }, healingActions, state).stateUpdate?.hp).toEqual({});
  });

  it.each([1, 2, 4])('settles fractional fallback deltas into whole points before saving a %i-player party', (partySize) => {
    const players = Array.from({ length: partySize }, (_, index) => makeInvestigator({ name: `调查员${index}`, currentHp: 8, currentSan: 45 }));
    const state = createInitialGameState(players);
    const response = { narrative: '调查员稍感疲惫。', stateUpdate: {
      hp: Object.fromEntries(players.map((player, index) => [player.name, index % 2 ? 1.8 : -0.5])),
      san: Object.fromEntries(players.map((player, index) => [player.name, index % 2 ? 2.9 : -1.8]))
    } };
    const reviewed = validateToolCalls([{ name: 'propose_state_update', arguments: response.stateUpdate }], { state, kb: getActiveKnowledgeBase() });
    expect(reviewed.rejected).toEqual([]);
    const settled = gameReducer(state, { type: 'applyAiResponse', response, raw: JSON.stringify(response) });
    const restored = hydrateGameState(settled);
    for (const [index, player] of settled.players.entries()) {
      expect(player.currentHp).toBe(index % 2 ? 9 : 8);
      expect(player.currentSan).toBe(index % 2 ? 47 : 44);
      expect(restored.players[index].currentHp).toBe(player.currentHp);
      expect(restored.players[index].currentSan).toBe(player.currentSan);
    }
  });

  it('keeps resource clamps and legacy save compatibility after normalizing incoming deltas', () => {
    const state = createInitialGameState([makeInvestigator({ name: '亨利', currentHp: 2, currentSan: 20 })]);
    const depleted = gameReducer(state, { type: 'applyAiResponse', raw: '{}', response: {
      stateUpdate: { hp: { 亨利: -999.5 }, san: { 亨利: -999.5 } }
    } });
    expect(depleted.players[0].currentHp).toBe(0);
    expect(depleted.players[0].currentSan).toBe(0);
    const recovered = gameReducer(depleted, { type: 'applyAiResponse', raw: '{}', response: {
      stateUpdate: { hp: { 亨利: 999.5 }, san: { 亨利: 999.5 } }
    } });
    expect(recovered.players[0].currentHp).toBe(recovered.players[0].hp);
    expect(recovered.players[0].currentSan).toBe(recovered.players[0].san);
    const legacy = { ...state, players: [{ ...state.players[0], currentHp: 7.8, currentSan: 30.5 }] };
    const restored = hydrateGameState(legacy);
    expect(restored.players[0].currentHp).toBe(7);
    expect(restored.players[0].currentSan).toBe(30);
    expect(hydrateGameState(restored).players).toEqual(restored.players);
  });

  it('retains local resource receipts across queued dice, retries and save restoration', () => {
    const state = createInitialGameState([
      makeInvestigator({ name: '亨利' }), makeInvestigator({ name: '艾达' })
    ]);
    const prior: CheckContinuationAction[] = [
      ...actions,
      { player: '艾达', action: '【检定结果】艾达受到了结算伤害。',
        checkResult: { skill: '格斗（拳）', outcome: 'fumble', settledResources: { hp: -2, san: -1 } } }
    ];
    state.pendingDmActions = prior;
    state.pendingCheck = { player: '亨利', skill: '侦查', difficulty: '普通', resolvedActions: prior,
      queuedChecks: [{ player: '艾达', skill: '侦查', difficulty: '普通' }] };
    const restored = hydrateGameState(state);
    expect(restored.pendingDmActions).toEqual(prior.map(action => expect.objectContaining(action)));
    expect(restored.pendingCheck?.resolvedActions).toEqual(prior.map(action => expect.objectContaining(action)));
    const next = gameReducer(restored, { type: 'applyDiceResult', result: { roll: 10, level: 'crit', label: '极难成功（10）' },
      resultAction: { player: '亨利', action: '【检定结果】侦查成功', checkResult: { skill: '侦查', outcome: 'crit' } } });
    const receipts = next.pendingCheck!.resolvedActions!;
    expect(getSettledResourceDelta(receipts, '亨利', 'hp')).toBe(-1);
    expect(getSettledResourceDelta(receipts, '艾达', 'hp')).toBe(-2);
    expect(getSettledResourceDelta(receipts, '艾达', 'san')).toBe(-1);
    expect(getSettledResourceDelta(receipts, '亨利', 'san')).toBe(0);
  });

  it('ignores malformed and absent legacy receipts without inferring a past injury', () => {
    const state = createInitialGameState([makeInvestigator({ name: '亨利', currentHp: 2 })]);
    const restored = hydrateGameState({ ...state, pendingDmActions: [{
      player: '亨利', action: '【检定结果】亨利的格斗大失败。',
      checkResult: { skill: '格斗（拳）', outcome: 'fumble', settledResources: { hp: Number.NaN, san: '-3' } }
    }, { player: '亨利', action: '【检定结果】旧版检定大失败。', checkResult: { skill: '格斗（拳）', outcome: 'fumble' } }] });
    expect(restored.pendingDmActions?.every(action => action.checkResult?.settledResources === undefined)).toBe(true);
    expect(getSettledResourceDelta(restored.pendingDmActions!, '亨利', 'hp')).toBe(0);
    expect(getSettledResourceDelta(restored.pendingDmActions!, '亨利', 'san')).toBe(0);
  });
});
