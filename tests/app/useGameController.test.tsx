import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameController } from '../../src/app/useGameController';
import { runDmTurn } from '../../src/dm/pipeline';
import { AiResponseFormatError } from '../../src/services/aiDm';
import { readSaves, saveGameState } from '../../src/services/storage';
import { createInitialGameState } from '../../src/state/gameReducer';
import { makeInvestigator } from '../dm/fixtures';

vi.mock('../../src/dm/pipeline', () => ({ runDmTurn: vi.fn() }));
const dm = vi.mocked(runDmTurn);
const players = [makeInvestigator({ id: 'p1', name: '亨利' }), makeInvestigator({ id: 'p2', name: '艾达' })];
const response = { raw: '{"narrative":"调查继续。"}', legacyResponse: { narrative: '调查继续。' } };

function configureApi() {
  localStorage.setItem('trpg-api', JSON.stringify({ apiKey: 'test-key', provider: 'openai', protocol: 'responses' }));
}

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv('VITE_AI_API_KEY', '');
  dm.mockReset();
  dm.mockResolvedValue(response);
});
afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function declareParty(result: ReturnType<typeof renderHook<ReturnType<typeof useGameController>, unknown>>['result']) {
  act(() => result.current.startGame(players));
  act(() => result.current.setDeclaration('p1', '询问失踪时间'));
  act(() => result.current.submitAction());
  act(() => result.current.setDeclaration('p2', '询问最近来客'));
  act(() => result.current.submitAction());
}

describe('game controller round recovery', () => {
  it('keeps every declaration when the API has not been configured', async () => {
    const { result } = renderHook(useGameController);
    declareParty(result);
    expect(result.current.apiOpen).toBe(true);
    expect(result.current.state.currentActorIndex).toBe(1);
    expect(result.current.state.declarations).toEqual({ p1: '询问失踪时间', p2: '询问最近来客' });
    expect(result.current.state.conversationHistory).toHaveLength(0);
    expect(dm).not.toHaveBeenCalled();
    configureApi();
    act(() => result.current.submitAction());
    await waitFor(() => expect(result.current.state.isThinking).toBe(false));
    expect(dm).toHaveBeenCalledOnce();
    expect(result.current.state.messages.filter((message) => message.type === 'player')).toHaveLength(2);
  });

  it('retries the same failed round without appending duplicate history or declarations', async () => {
    configureApi();
    dm.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(useGameController);
    declareParty(result);
    await waitFor(() => expect(result.current.state.isThinking).toBe(false));
    expect(result.current.state.pendingDmActions).toHaveLength(2);
    act(() => result.current.retryPendingTurn());
    await waitFor(() => expect(result.current.state.pendingDmActions).toBeUndefined());
    expect(dm.mock.calls[1][1].actions).toEqual(dm.mock.calls[0][1].actions);
    expect(result.current.state.conversationHistory.map((turn) => turn.role)).toEqual(['user', 'assistant']);
    expect(result.current.state.messages.filter((message) => message.type === 'player')).toHaveLength(2);
  });

  it('limits automatic recovery to a final single-attempt Narrator pass', async () => {
    configureApi();
    dm.mockRejectedValue(new AiResponseFormatError('invalid JSON'));
    const { result } = renderHook(useGameController);
    declareParty(result);
    await waitFor(() => expect(result.current.state.isThinking).toBe(false));
    expect(dm).toHaveBeenCalledTimes(2);
    expect(dm.mock.calls[1][1].narratorAttempts).toBe(1);
    expect(result.current.state.pendingDmActions).toHaveLength(2);
  });

  it('persists an in-flight round and allows its response to be resumed after loading', async () => {
    configureApi();
    dm.mockImplementationOnce(() => new Promise(() => {}));
    const { result } = renderHook(useGameController);
    declareParty(result);
    act(() => result.current.saveCurrentGame());
    expect(readSaves()[0].gameState.pendingDmActions).toHaveLength(2);
    act(() => result.current.loadCurrentLatest());
    expect(result.current.state.isThinking).toBe(false);
    act(() => result.current.retryPendingTurn());
    await waitFor(() => expect(result.current.state.pendingDmActions).toBeUndefined());
    expect(result.current.state.conversationHistory).toHaveLength(2);
  });

  it('synchronously guards repeated submission and ignores the old session response', async () => {
    configureApi();
    let resolve!: (value: typeof response) => void;
    dm.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { result } = renderHook(useGameController);
    act(() => result.current.startGame([players[0]]));
    act(() => result.current.setDeclaration('p1', '询问情况'));
    act(() => { result.current.submitAction(); result.current.submitAction(); });
    expect(dm).toHaveBeenCalledOnce();
    act(() => result.current.startGame(players));
    await act(async () => resolve(response));
    expect(result.current.state.conversationHistory).toEqual([]);
    expect(result.current.state.messages).toHaveLength(1);
  });

  it('times out even when the provider never settles or observes abort', async () => {
    vi.useFakeTimers();
    configureApi();
    dm.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(useGameController);
    declareParty(result);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(result.current.state.isThinking).toBe(false);
    expect(result.current.state.pendingDmActions).toHaveLength(2);
    expect(result.current.state.messages.some((message) => message.text.includes('连接超时'))).toBe(true);
  });

  it('retains a confirmed roll for retry without re-rolling or duplicating consequences', async () => {
    configureApi();
    dm.mockRejectedValueOnce(new Error('offline'));
    const state = createInitialGameState([players[0]]);
    state.pendingCheck = {
      player: '亨利', skill: '侦查', difficulty: '普通',
      continuationActions: [{ player: '亨利', action: '调查桌面' }],
      resolution: { kind: 'authored', targetItemIds: ['I01'], success: '找到便签', failure: '发现最低信息' }
    };
    saveGameState(state);
    const { result } = renderHook(useGameController);
    act(() => { result.current.loadLatest(); });
    act(() => result.current.handleRoll());
    act(() => result.current.saveCurrentGame());
    expect(readSaves()).toHaveLength(1);
    expect(result.current.toast).toContain('确认本次掷骰');
    await waitFor(() => expect(result.current.diceRoll?.phase).toBe('revealed'), { timeout: 3000 });
    act(() => { result.current.confirmDiceResult(); result.current.confirmDiceResult(); });
    await waitFor(() => expect(result.current.state.isThinking).toBe(false));
    const pending = result.current.state.pendingDmActions;
    expect(pending?.[1].checkResult?.targetItemIds).toEqual(['I01']);
    expect(result.current.state.pendingCheck).toBeNull();
    act(() => result.current.retryPendingTurn());
    await waitFor(() => expect(result.current.state.pendingDmActions).toBeUndefined());
    expect(dm.mock.calls[1][1].actions).toEqual(pending);
    expect(result.current.state.messages.filter((message) => message.type === 'system' && message.text.startsWith('亨利 · 侦查：'))).toHaveLength(1);
  });
});
