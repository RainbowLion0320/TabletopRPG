import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSaveSlots } from '../../src/app/useSaveSlots';
import { useGameController } from '../../src/app/useGameController';
import { createNativeStorage, type NativeStore } from '../../src/android/native';
import { flushGameStorage, installGameStorage } from '../../src/platform/storage';
import * as storage from '../../src/services/storage';
import type { GameState, SaveSlot } from '../../src/types/game';
import { makeInvestigator, makeState } from '../dm/fixtures';

const SAVE_KEY = 'trpg-saves-v2';
const persist = storage.saveGameStateAndPersist;
interface DeferredWrite {
  key: string;
  value: string | null;
  resolve: () => void;
  reject: (error: Error) => void;
}

function deferredNativeStorage() {
  const disk = new Map<string, string>();
  const pending: DeferredWrite[] = [];
  const writes: Array<{ key: string; value: string | null }> = [];
  let automatic = false;
  let failing = false;
  const apply = ({ key, value }: { key: string; value: string | null }) => {
    if (value === null) disk.delete(key); else disk.set(key, value);
  };
  const native: NativeStore = {
    readAll: async () => ({ values: {} }),
    write: ({ key, value }) => {
      writes.push({ key, value });
      if (failing) return Promise.reject(new Error('QA storage failure'));
      if (automatic) { apply({ key, value }); return Promise.resolve(); }
      return new Promise<void>((resolve, reject) => pending.push({ key, value,
        resolve: () => { apply({ key, value }); resolve(); }, reject }));
    }
  };
  installGameStorage(createNativeStorage({ 'trpg-tutorial-opt-out': 'off' }, native));
  return {
    pending, writes,
    records: () => JSON.parse(disk.get(SAVE_KEY) ?? '[]') as SaveSlot[],
    finish: () => { const next = pending.shift(); expect(next).toBeDefined(); next!.resolve(); },
    fail: () => { failing = true; const next = pending.shift(); expect(next).toBeDefined(); next!.reject(new Error('QA storage failure')); },
    releaseAll: () => { failing = false; automatic = true; while (pending.length) pending.shift()!.resolve(); }
  };
}

let deferred: ReturnType<typeof deferredNativeStorage> | undefined;
let operations: Promise<SaveSlot>[];
beforeEach(() => {
  localStorage.clear(); operations = [];
  vi.spyOn(storage, 'saveGameStateAndPersist').mockImplementation(state => {
    const operation = persist(state); operations.push(operation); return operation;
  });
});
afterEach(async () => {
  await act(async () => {
    deferred?.releaseAll(); await Promise.allSettled(operations); await flushGameStorage();
  });
  cleanup(); installGameStorage(localStorage); localStorage.clear(); deferred = undefined; vi.restoreAllMocks();
});

function snapshot(party: number, declaration: string): GameState {
  const state = makeState({ players: Array.from({ length: party }, (_, index) =>
    makeInvestigator({ id: `save-${index}`, name: ['亨利', '艾达', '托马斯', '罗伯特'][index] })) });
  return { ...state, declarations: { [state.players[0].id]: declaration } };
}

describe('manual save requests and native persistence feedback', () => {
  it('merges only repeated clicks for the same pending snapshot and permits a later separate save', async () => {
    deferred = deferredNativeStorage();
    const notify = vi.fn(), state = snapshot(1, '同一份草稿');
    const { result } = renderHook(() => useSaveSlots(notify));
    act(() => { void result.current.saveCurrentGame(state); void result.current.saveCurrentGame(state); });
    expect(operations).toHaveLength(1);
    await waitFor(() => expect(deferred!.pending).toHaveLength(1));
    expect(notify).not.toHaveBeenCalled();
    await act(async () => { deferred!.finish(); await operations[0]; });
    expect(deferred.records()).toHaveLength(1); expect(notify).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledWith('已保存');
    act(() => { void result.current.saveCurrentGame(state); });
    expect(operations).toHaveLength(2);
    await waitFor(() => expect(deferred!.pending).toHaveLength(1));
    await act(async () => { deferred!.finish(); await operations[1]; });
    expect(deferred.records()).toHaveLength(2);
  });

  it('still reports a current save failure, keeps the library accurate and accepts retrying the same snapshot', async () => {
    deferred = deferredNativeStorage();
    const notify = vi.fn(), state = snapshot(1, '落盘失败后仍可重试');
    const { result } = renderHook(() => useSaveSlots(notify));
    act(() => { void result.current.saveCurrentGame(state); });
    await waitFor(() => expect(deferred!.pending).toHaveLength(1));
    await act(async () => { deferred!.fail(); await operations[0].catch(() => undefined); });
    expect(deferred.records()).toHaveLength(0); expect(storage.readSaveLibrary().saves).toHaveLength(0);
    expect(result.current.saves).toHaveLength(0);
    expect(notify).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledWith('未能保存，请检查设备存储空间后重试。');
    await act(async () => { deferred!.releaseAll(); await flushGameStorage(); });
    notify.mockClear();
    act(() => { void result.current.saveCurrentGame(state); });
    expect(operations).toHaveLength(2);
    await act(async () => { await operations[1]; });
    expect(deferred.records()).toHaveLength(1); expect(result.current.saves).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledWith('已保存');
  });

  for (const party of [1, 2, 4]) it(`preserves both changed snapshots for ${party} players while merging duplicate clicks and announcing only the latest completion`, async () => {
    deferred = deferredNativeStorage();
    const notify = vi.fn(), first = snapshot(party, '草稿 A\n先查看信件');
    const second = { ...first, currentActorIndex: party - 1, declarations: { [first.players[0].id]: '草稿 B\n再查看门廊' } };
    const { result } = renderHook(() => useSaveSlots(notify));
    act(() => { void result.current.saveCurrentGame(first); void result.current.saveCurrentGame(first); });
    await waitFor(() => expect(deferred!.pending).toHaveLength(1));
    act(() => { void result.current.saveCurrentGame(second); void result.current.saveCurrentGame(second); });
    expect(operations.length).toBe(2);
    expect(deferred.writes.length).toBe(1);
    await act(async () => { deferred!.finish(); await operations[0]; });
    expect(notify).not.toHaveBeenCalled();
    await waitFor(() => expect(deferred!.pending).toHaveLength(1));
    await act(async () => { deferred!.finish(); await operations[1]; });
    const records = deferred.records();
    expect(records).toHaveLength(2); expect(new Set(records.map(record => record.id)).size).toBe(2);
    expect(records.map(record => record.gameState.declarations[first.players[0].id])).toEqual(['草稿 B\n再查看门廊', '草稿 A\n先查看信件']);
    expect(records[0].gameState.currentActorIndex).toBe(party - 1);
    expect(records.every(record => record.gameState.players.length === party)).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledWith('已保存');
    expect(first.declarations[first.players[0].id]).toBe('草稿 A\n先查看信件');
  });

  for (const route of ['returnHome', 'restartSetup'] as const) for (const outcome of ['saved', 'failed']) {
    it(`keeps the old ${outcome} completion out of ${route} without cancelling the persistence operation`, async () => {
      deferred = deferredNativeStorage();
      const { result } = renderHook(useGameController);
      const player = makeInvestigator({ id: 'previous-party', name: '亨利' });
      act(() => result.current.startGame([player]));
      act(() => result.current.setDeclaration(player.id, '上一局已要求保存的草稿'));
      act(() => result.current.saveCurrentGame());
      await waitFor(() => expect(deferred!.pending).toHaveLength(1));
      act(() => result.current[route]());
      expect(result.current.toast).toBe('');
      await act(async () => {
        if (outcome === 'saved') deferred!.finish(); else deferred!.fail();
        await operations[0].catch(() => undefined);
      });
      if (outcome === 'failed') {
        expect(deferred.records()).toHaveLength(0);
        expect(storage.readSaveLibrary().saves).toHaveLength(0);
        expect(result.current.saves).toHaveLength(0);
      }
      expect(result.current.toast).toBe('');
      if (outcome === 'saved') {
        expect(deferred.records()).toHaveLength(1);
        expect(deferred.records()[0].gameState.declarations[player.id]).toBe('上一局已要求保存的草稿');
        expect(result.current.saves).toHaveLength(1);
      } else expect(deferred.records()).toHaveLength(0);
      expect(operations).toHaveLength(1);
    });
  }

  it('keeps the current load confirmation when a previous save completes later', async () => {
    deferred = deferredNativeStorage();
    const { result } = renderHook(useGameController);
    const player = makeInvestigator({ id: 'save-origin', name: '亨利' });
    act(() => result.current.startGame([player]));
    act(() => result.current.setDeclaration(player.id, '保存原局')); act(() => result.current.saveCurrentGame());
    await waitFor(() => expect(deferred!.pending).toHaveLength(1));
    const loaded = snapshot(2, '读取另一份记录');
    act(() => result.current.loadSaveSlot(loaded));
    expect(result.current.toast).toBe('已载入存档');
    await act(async () => { deferred!.finish(); await operations[0]; });
    expect(result.current.toast).toBe('已载入存档');
    expect(result.current.state.players).toHaveLength(2);
    expect(result.current.state.declarations[loaded.players[0].id]).toBe('读取另一份记录');
    expect(deferred.records()).toHaveLength(1);
  });
});
