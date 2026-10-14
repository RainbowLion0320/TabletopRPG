import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameController } from '../../src/app/useGameController';
import { App } from '../../src/app/App';
import { runDmTurn } from '../../src/dm/pipeline';
import { guidedDeclaration, normalizeOnboarding } from '../../src/services/onboarding';
import { createInitialGameState, gameReducer, hydrateGameState } from '../../src/state/gameReducer';
import { createInvestigatorFromPreset, presets } from '../../src/data/presets';
import { getSkillTotal } from '../../src/services/dice';
import { readSaves, saveGameState } from '../../src/services/storage';
import { getDmRequestTurn } from '../../src/services/turns';
import { installGameStorage } from '../../src/platform/storage';
import { ONBOARDING_SEEN_KEY } from '../../src/platform/onboarding';
import { DICE_ROLL_DURATION_MS } from '../../src/app/diceRollAnimation';
import type { GameState } from '../../src/types/game';

vi.mock('../../src/dm/pipeline', () => ({ runDmTurn: vi.fn() }));
vi.mock('../../src/audio/AudioDirector', () => ({ AudioDirector: () => null }));
const dm = vi.mocked(runDmTurn);
type ControllerRef = { current: ReturnType<typeof useGameController> };
const party = (count: number) => presets.slice(0, count).map(preset => createInvestigatorFromPreset(preset));
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
beforeAll(() => { Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }); });
afterAll(() => {
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

beforeEach(() => {
  installGameStorage(localStorage); localStorage.clear();
  localStorage.setItem('trpg-opening-v1', 'seen');
  vi.stubEnv('VITE_AI_API_KEY', '');
  dm.mockReset(); dm.mockResolvedValue({ raw: '{"narrative":"调查继续。"}', legacyResponse: { narrative: '调查继续。' } });
});
afterEach(() => { installGameStorage(localStorage); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

function declareRound(result: ControllerRef) {
  for (const player of result.current.state.players) {
    const text = guidedDeclaration(result.current.state, player.id)!;
    expect(text).toBeTruthy();
    act(() => result.current.applySuggestion(text));
    act(() => result.current.submitAction());
  }
}
function toCheck(result: ControllerRef, count = 1) {
  act(() => result.current.startGame(party(count)));
  declareRound(result); declareRound(result);
  expect(result.current.state.onboarding?.step).toBe('roll');
}
async function confirmRoll(result: ControllerRef, roll = 10) {
  vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue((roll - .5) / 100);
  act(() => result.current.handleRoll());
  await act(async () => { await vi.advanceTimersByTimeAsync(DICE_ROLL_DURATION_MS + 1); });
  expect(result.current.diceRoll?.result.roll).toBe(roll);
  act(() => result.current.confirmDiceResult());
  vi.useRealTimers();
}
function readPanels(result: ControllerRef) {
  act(() => result.current.onboardingPanel('records', 'opened'));
  act(() => result.current.onboardingPanel('records', 'closed'));
  act(() => result.current.onboardingPanel('character', 'opened'));
  act(() => result.current.onboardingPanel('character', 'closed'));
}

describe('first investigation with real game state', () => {
  for (const count of [1, 2, 4]) it(`teaches ${count} investigators through two party turns without an API or premature evidence`, async () => {
    const { result } = renderHook(useGameController);
    act(() => result.current.startGame(party(count)));
    expect(result.current.state.onboarding?.step).toBe('action');
    for (const [index, player] of result.current.state.players.entries()) {
      act(() => result.current.applySuggestion(guidedDeclaration(result.current.state, player.id)!));
      act(() => { result.current.submitAction(); result.current.submitAction(); });
      expect(result.current.state.onboarding?.step).toBe(index === count - 1 ? 'search' : 'action');
    }
    expect(result.current.state.scenarioProgress.variables.commissionAccepted).toBe(true);
    expect(result.current.state.scenarioProgress.knownFactIds).toContain('F04');
    expect(result.current.state.messages.filter(message => message.type === 'player')).toHaveLength(count);
    declareRound(result);
    const check = result.current.state.pendingCheck!;
    expect(check.player).toBe(result.current.state.players[0].name);
    expect(check.threshold).toBe(getSkillTotal(result.current.state.players[0], '侦查'));
    expect(check.continuationActions).toHaveLength(count);
    expect(result.current.state.clues).toHaveLength(0);
    expect(result.current.state.scenarioProgress.knownFactIds).not.toContain('F05');
    expect(result.current.apiOpen).toBe(false); expect(dm).not.toHaveBeenCalled();
    await confirmRoll(result);
    expect(result.current.state.clues.map(clue => clue.id)).toEqual(['I02']);
    expect(result.current.state.scenarioProgress.knownFactIds).toContain('F05');
    expect(result.current.state.onboarding?.step).toBe('records');
    expect(result.current.state.pendingCheck).toBeNull();
    expect(result.current.state.players.every(player => player.currentHp === player.hp && player.currentSan === player.san)).toBe(true);
    expect(dm).not.toHaveBeenCalled();
  });

  for (const roll of [10, 90, 100]) it(`honors the real ${roll} outcome and the authored fail-forward cost exactly once`, async () => {
    const { result } = renderHook(useGameController); toCheck(result);
    const before = result.current.state.scenarioProgress.worldTime;
    await confirmRoll(result, roll);
    const progress = result.current.state.scenarioProgress;
    expect(progress.firedEventIds).toContain(roll === 10 ? 'EV_FIND_I02' : 'EV_FAIL_I02');
    expect(progress.firedEventIds).not.toContain(roll === 10 ? 'EV_FAIL_I02' : 'EV_FIND_I02');
    // Every settled turn costs the normal five minutes; failure adds ten more.
    expect((Date.parse(progress.worldTime) - Date.parse(before)) / 60_000).toBe(roll === 10 ? 5 : 15);
    const settled = result.current.state;
    act(() => result.current.confirmDiceResult());
    expect(result.current.state).toBe(settled);
    expect(settled.scenarioProgress.knownFactIds).not.toContain('F02');
    expect(settled.messages.every(message => !message.text.includes('私下勾连'))).toBe(true);
  });

  it('keeps a partially declared multiplayer lesson intact through save hydration', () => {
    const { result } = renderHook(useGameController);
    act(() => result.current.startGame(party(4)));
    act(() => result.current.applySuggestion(guidedDeclaration(result.current.state, result.current.state.players[0].id)!));
    act(() => result.current.submitAction());
    const saved = hydrateGameState(JSON.parse(JSON.stringify(result.current.state)));
    act(() => result.current.loadSaveSlot(saved));
    expect(result.current.state.currentActorIndex).toBe(1);
    expect(result.current.state.onboarding?.step).toBe('action');
    for (const player of result.current.state.players.slice(1)) {
      act(() => result.current.applySuggestion(guidedDeclaration(result.current.state, player.id)!));
      act(() => result.current.submitAction());
    }
    expect(result.current.state.messages.filter(message => message.type === 'player')).toHaveLength(4);
    expect(result.current.state.scenarioProgress.firedEventIds.filter(id => id === 'EV_ACCEPT_COMMISSION')).toHaveLength(1);
  });

  it('restores a locked lesson roll and settles it without rolling again or contacting AI', () => {
    const { result } = renderHook(useGameController); toCheck(result, 2);
    const saved = hydrateGameState(JSON.parse(JSON.stringify(result.current.state)));
    const check = saved.pendingCheck!;
    act(() => result.current.restoreSession(saved, { check, result: { roll: 100, level: 'fumble', label: '大失败' }, phase: 'revealed' }));
    act(() => result.current.confirmDiceResult());
    expect(result.current.state.clues.map(clue => clue.id)).toEqual(['I02']);
    expect(result.current.state.scenarioProgress.firedEventIds).toContain('EV_FAIL_I02');
    expect(result.current.state.onboarding?.step).toBe('records'); expect(dm).not.toHaveBeenCalled();
  });

  it('can skip with a pending check, keep its locked dice, and still finish that actual investigation locally', async () => {
    const { result } = renderHook(useGameController); toCheck(result);
    const check = result.current.state.pendingCheck;
    act(() => result.current.finishOnboarding('skipped'));
    expect(result.current.state.pendingCheck).toBe(check);
    expect(hydrateGameState(result.current.state).onboarding?.pendingPhotoCheck).toBe(true);
    await confirmRoll(result, 90);
    expect(result.current.state.onboarding?.step).toBe('skipped');
    expect(result.current.state.clues).toHaveLength(1); expect(dm).not.toHaveBeenCalled();
    act(() => result.current.startGame(party(1)));
    expect(result.current.state.onboarding).toBeUndefined();
  });

  it('does not discard already declared teammates when a player skips mid-turn', async () => {
    localStorage.setItem('trpg-api', JSON.stringify({ apiKey: 'test-key', provider: 'openai', protocol: 'responses' }));
    const { result } = renderHook(useGameController);
    act(() => result.current.startGame(party(2)));
    const first = guidedDeclaration(result.current.state, result.current.state.players[0].id)!;
    act(() => result.current.applySuggestion(first)); act(() => result.current.submitAction());
    act(() => result.current.finishOnboarding('skipped'));
    act(() => result.current.setDeclaration(result.current.state.players[1].id, '先去门外询问邻居'));
    act(() => result.current.submitAction());
    await waitFor(() => expect(dm).toHaveBeenCalledOnce());
    expect(dm.mock.calls[0][1].actions.map(action => action.action)).toEqual([first, '先去门外询问邻居']);
    expect(result.current.state.messages.filter(message => message.type === 'player')).toHaveLength(2);
  });

  it('requires actual opening and closing of the indicated reader, without moving the story or rolling again', async () => {
    const { result } = renderHook(useGameController); toCheck(result); await confirmRoll(result);
    const history = result.current.state.conversationHistory;
    act(() => result.current.onboardingPanel('records', 'closed'));
    expect(result.current.state.onboarding?.step).toBe('records');
    act(() => result.current.onboardingPanel('character', 'opened'));
    expect(result.current.state.onboarding?.step).toBe('records');
    readPanels(result);
    expect(result.current.state.onboarding?.step).toBe('finish');
    expect(result.current.state.conversationHistory).toBe(history);
    act(() => result.current.finishOnboarding('done'));
    expect(localStorage.getItem(ONBOARDING_SEEN_KEY)).toBe('seen');
  });

  it('saves the finished guide only after a real successful save and never reopens its final tip on load', async () => {
    const { result } = renderHook(useGameController); toCheck(result); await confirmRoll(result); readPanels(result);
    act(() => { result.current.saveCurrentGame(); result.current.saveCurrentGame(); });
    await waitFor(() => expect(result.current.state.onboarding?.step).toBe('done'));
    expect(readSaves()).toHaveLength(1); expect(readSaves()[0].gameState.onboarding?.step).toBe('done');
    act(() => result.current.loadSaveSlot(readSaves()[0].gameState));
    expect(result.current.state.onboarding?.step).toBe('done');
    expect(result.current.toast).toBe('已载入存档');
  });

  it('leaves the final guide retryable if persistence fails', async () => {
    const { result } = renderHook(useGameController); toCheck(result); await confirmRoll(result); readPanels(result);
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'trpg-saves-v2') throw new Error('quota'); original.call(this, key, value);
    });
    act(() => result.current.saveCurrentGame());
    await waitFor(() => expect(result.current.toast).toContain('未能保存'));
    expect(result.current.state.onboarding?.step).toBe('finish');
    expect(localStorage.getItem(ONBOARDING_SEEN_KEY)).toBeNull(); expect(readSaves()).toHaveLength(0);
  });

  it('hands the third turn to the normal DM with both authored turns, the true roll and revealed evidence', async () => {
    const { result } = renderHook(useGameController); toCheck(result); await confirmRoll(result); readPanels(result);
    act(() => result.current.finishOnboarding('done'));
    localStorage.setItem('trpg-api', JSON.stringify({ apiKey: 'test-key', provider: 'openai', protocol: 'responses' }));
    const player = result.current.state.players[0];
    act(() => result.current.setDeclaration(player.id, '拿着合影，去门外询问邻居是否见过这个人'));
    act(() => result.current.submitAction());
    await waitFor(() => expect(dm).toHaveBeenCalledOnce());
    const context = dm.mock.calls[0][1];
    expect(getDmRequestTurn(context.state.conversationHistory, context.state.summarizedTurnCount)).toBe(3);
    expect(context.state.scenarioProgress.knownFactIds).toContain('F05');
    expect(context.state.conversationHistory.some(turn => turn.content.includes('【检定结果】') && turn.content.includes('10'))).toBe(true);
    expect(context.actions[0].action).toBe('拿着合影，去门外询问邻居是否见过这个人');
    expect(context.state.onboarding?.step).toBe('done');
  });

  it('does not insert guidance into an existing investigation or a returning player’s next game', () => {
    const old = createInitialGameState(party(1)); saveGameState(old);
    const { result } = renderHook(useGameController);
    act(() => result.current.startGame(party(1)));
    expect(result.current.state.onboarding).toBeUndefined();
    act(() => result.current.loadLatest());
    expect(result.current.state.onboarding).toBeUndefined();
    act(() => result.current.startGame(party(1)));
    expect(result.current.state.onboarding).toBeUndefined();
  });

  it('ignores corrupt or unrelated lesson metadata without altering a real pending check', () => {
    const state = createInitialGameState(party(1));
    expect(normalizeOnboarding({ version: 9, step: 'action' }, state)).toBeUndefined();
    expect(normalizeOnboarding({ version: 1, step: 'roll', pendingPhotoCheck: true }, state)).toBeUndefined();
    state.pendingCheck = { player: state.players[0].name, skill: '聆听', difficulty: '普通' };
    const saved = hydrateGameState({ ...state, onboarding: { version: 1, step: 'roll', pendingPhotoCheck: true } });
    expect(saved.onboarding).toBeUndefined(); expect(saved.pendingCheck?.skill).toBe('聆听');
  });

  it('rejects authored replies for arbitrary freeform actions instead of silently replacing their outcome', () => {
    const state = gameReducer(createInitialGameState(party(1)), { type: 'start', players: party(1), onboarding: true });
    expect(gameReducer(state, { type: 'resolveOnboardingTurn', actions: [{ player: state.players[0].name, action: '离开住宅' }] })).toBe(state);
  });
});

describe('novice controls', () => {
  it('points to an actual suggestion and submission, keeps the IME out of the two lesson turns, and unlocks after skip', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '开始游戏', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '进入游戏', exact: true }));
    const input = screen.getByRole('textbox', { name: /的行动$/ }) as HTMLTextAreaElement;
    expect(input.readOnly).toBe(true);
    expect(screen.getByLabelText('新手调查')).toHaveTextContent('轻点下面的建议');
    fireEvent.click(screen.getByRole('button', { name: firstLessonAction() }));
    expect(input.value).toBe(firstLessonAction());
    expect(screen.getByLabelText('新手调查')).toHaveTextContent('点「提交」确认');
    fireEvent.click(screen.getByRole('button', { name: '提交', exact: true }));
    expect(screen.getByLabelText('新手调查')).toHaveTextContent('调查身边的痕迹');
    fireEvent.click(screen.getByRole('button', { name: '跳过引导', exact: true }));
    expect(input.readOnly).toBe(false); expect(screen.queryByLabelText('新手调查')).toBeNull();
    expect(dm).not.toHaveBeenCalled();
  });
});

function firstLessonAction() { const players = party(1); return guidedDeclaration({ ...createInitialGameState(players), onboarding: { version: 1, step: 'action' } } as GameState, players[0].id)!; }
