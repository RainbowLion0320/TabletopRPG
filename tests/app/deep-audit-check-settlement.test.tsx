import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameController } from '../../src/app/useGameController';
import { DICE_ROLL_DURATION_MS } from '../../src/app/diceRollAnimation';
import { runDmTurn } from '../../src/dm/pipeline';
import { createInitialGameState } from '../../src/state/gameReducer';
import { makeInvestigator } from '../dm/fixtures';

vi.mock('../../src/dm/pipeline', () => ({ runDmTurn: vi.fn() }));
const dm = vi.mocked(runDmTurn);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('trpg-tutorial-opt-out', 'off');
  localStorage.setItem('trpg-api', JSON.stringify({ apiKey: 'unit-test-key', provider: 'openai', protocol: 'responses' }));
  vi.stubEnv('VITE_AI_API_KEY', '');
  dm.mockReset();
  dm.mockResolvedValue({ raw: '{}', legacyResponse: { narrative: '调查员退回掩体，战斗仍在继续。' } });
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(.999);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); localStorage.clear(); });

function combatState(count: number) {
  const names = ['亨利', '艾达', '托马斯', '罗伯特'];
  const state = createInitialGameState(names.slice(0, count).map((name, index) => makeInvestigator({ id: `p${index}`, name })));
  const actor = state.players[count - 1];
  state.currentScene = 'S05';
  Object.assign(state.scenarioProgress.beatStates, { B01: 'completed', B02: 'completed', B05: 'completed', B06: 'active' });
  Object.assign(state.scenarioProgress.variables, { finaleRoute: 'combat', combatRoundStarted: true });
  state.scenarioProgress.encounters.ENC01.state = 'active';
  state.scenarioProgress.clocks.fusangEscape = { value: 2, active: true, visible: true };
  state.pendingCheck = { scenarioCheckId: 'CHECK_COMBAT', player: actor.name, skill: '格斗（拳）', difficulty: '普通' };
  return state;
}

describe('authored check resource receipt', () => {
  it.each([1, 2, 4])('carries the exact local charge into the DM continuation for %i investigators', async count => {
    const state = combatState(count);
    const actor = state.players[count - 1];
    const { result } = renderHook(useGameController);
    act(() => result.current.restoreSession(state, null));
    act(() => result.current.handleRoll());
    await act(async () => { await vi.advanceTimersByTimeAsync(DICE_ROLL_DURATION_MS + 1); });
    await act(async () => { result.current.confirmDiceResult(); });
    expect(dm).toHaveBeenCalledOnce();
    const turn = dm.mock.calls[0][1];
    expect(turn.actions.at(-1)).toMatchObject({ player: actor.name, checkResult: { outcome: 'fumble', settledResources: { hp: -1 } } });
    expect(turn.actions.at(-1)?.action).toContain('HP -1，已计入当前数值');
    expect(result.current.state.players[count - 1].currentHp).toBe(actor.currentHp - 1);
    expect(turn.state.players[count - 1].currentHp).toBe(actor.currentHp - 1);
    expect(result.current.state.players.slice(0, count - 1).map(player => player.currentHp)).toEqual(state.players.slice(0, count - 1).map(player => player.currentHp));
  });

  it('keeps the receipt on a saved failed continuation and never rolls or charges it again on retry', async () => {
    dm.mockRejectedValueOnce(new Error('offline'));
    const state = combatState(2);
    const { result } = renderHook(useGameController);
    act(() => result.current.restoreSession(state, null));
    act(() => result.current.handleRoll());
    await act(async () => { await vi.advanceTimersByTimeAsync(DICE_ROLL_DURATION_MS + 1); });
    await act(async () => { result.current.confirmDiceResult(); });
    const saved = JSON.parse(JSON.stringify(result.current.state));
    const hp = saved.players[1].currentHp;
    act(() => result.current.restoreSession(saved, null));
    await act(async () => { result.current.retryPendingTurn(); });
    expect(dm).toHaveBeenCalledTimes(2);
    expect(dm.mock.calls[1][1].actions.at(-1)?.checkResult?.settledResources).toEqual({ hp: -1 });
    expect(result.current.state.players[1].currentHp).toBe(hp);
    expect(result.current.diceRoll).toBeNull();
    expect(result.current.state.pendingDmActions).toBeUndefined();
  });

  it('preserves an earlier investigator receipt through a queued roll and restore', async () => {
    const state = combatState(2);
    state.pendingCheck!.queuedChecks = [{ player: '亨利', skill: '侦查', difficulty: '普通' }];
    const { result } = renderHook(useGameController);
    act(() => result.current.restoreSession(state, null));
    act(() => result.current.handleRoll());
    await act(async () => { await vi.advanceTimersByTimeAsync(DICE_ROLL_DURATION_MS + 1); });
    act(() => result.current.confirmDiceResult());
    expect(dm).not.toHaveBeenCalled();
    const saved = JSON.parse(JSON.stringify(result.current.state));
    act(() => result.current.restoreSession(saved, null));
    act(() => result.current.handleRoll());
    await act(async () => { await vi.advanceTimersByTimeAsync(DICE_ROLL_DURATION_MS + 1); });
    await act(async () => { result.current.confirmDiceResult(); });
    const actions = dm.mock.calls[0][1].actions;
    expect(actions.find(action => action.player === '艾达')?.checkResult?.settledResources).toEqual({ hp: -1 });
    expect(actions.find(action => action.player === '亨利')?.checkResult?.settledResources).toBeUndefined();
    expect(result.current.state.players[1].currentHp).toBe(state.players[1].currentHp - 1);
    expect(result.current.state.players[0].currentHp).toBe(state.players[0].currentHp);
  });
});
