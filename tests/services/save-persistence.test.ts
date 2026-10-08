import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNativeStorage, type NativeStore } from '../../src/android/native';
import { installGameStorage } from '../../src/platform/storage';
import { deleteSaveAndPersist, readSaveLibrary, saveGameState, saveGameStateAndPersist } from '../../src/services/storage';
import { makeState } from '../dm/fixtures';

const SAVE_KEY = 'trpg-saves-v2';
afterEach(() => { installGameStorage(localStorage); localStorage.clear(); vi.restoreAllMocks(); });

function twoSaves() {
  localStorage.clear();
  const first = saveGameState(makeState()), second = saveGameState(makeState());
  return { first, second, original: localStorage.getItem(SAVE_KEY)! };
}

describe('persistent manual save changes', () => {
  it('restores a failed deletion before later native flushes and only deletes on successful retry', async () => {
    const { first, second, original } = twoSaves();
    const disk = new Map([[SAVE_KEY, original], ['trpg-other', 'unchanged']]);
    let fail = true;
    const native: NativeStore = { readAll: vi.fn(), write: vi.fn(async ({ key, value }) => {
      if (fail) throw new Error('storage unavailable');
      if (value === null) disk.delete(key); else disk.set(key, value);
    }) };
    const cache = createNativeStorage(Object.fromEntries(disk), native); installGameStorage(cache);
    await expect(deleteSaveAndPersist(first.id)).rejects.toThrow();
    expect(cache.getItem(SAVE_KEY)).toBe(original);
    expect(disk.get(SAVE_KEY)).toBe(original);
    expect(readSaveLibrary().saves.map((slot) => slot.id)).toEqual([second.id, first.id]);
    fail = false; await cache.flush!();
    expect(disk.get(SAVE_KEY)).toBe(original);
    const result = await deleteSaveAndPersist(first.id);
    expect(result.saves.map((slot) => slot.id)).toEqual([second.id]);
    expect(JSON.parse(disk.get(SAVE_KEY)!).map((slot: { id: number }) => slot.id)).toEqual([second.id]);
    expect(disk.get('trpg-other')).toBe('unchanged');
  });

  it('restores the previous save library if saving fails, including an originally absent library', async () => {
    const { original } = twoSaves();
    const native: NativeStore = { readAll: vi.fn(), write: vi.fn().mockRejectedValue(new Error('full disk')) };
    const cache = createNativeStorage({ [SAVE_KEY]: original }, native); installGameStorage(cache);
    await expect(saveGameStateAndPersist(makeState())).rejects.toThrow();
    expect(cache.getItem(SAVE_KEY)).toBe(original);
    const empty = createNativeStorage({}, native); installGameStorage(empty);
    await expect(saveGameStateAndPersist(makeState())).rejects.toThrow();
    expect(empty.getItem(SAVE_KEY)).toBeNull();
    expect(readSaveLibrary().saves).toEqual([]);
  });

  it('serializes later changes so a failed deletion cannot overwrite a subsequent successful deletion', async () => {
    const { first, second, original } = twoSaves();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const disk = new Map([[SAVE_KEY, original]]);
    const native: NativeStore = { readAll: vi.fn(), write: vi.fn(async ({ key, value }) => {
      const ids = JSON.parse(value ?? '[]').map((slot: { id: number }) => slot.id);
      if (ids.length === 1 && ids[0] === second.id) {
        await held; throw new Error('first delete failed');
      }
      if (value === null) disk.delete(key); else disk.set(key, value);
    }) };
    const cache = createNativeStorage({ [SAVE_KEY]: original }, native); installGameStorage(cache);
    const firstAttempt = deleteSaveAndPersist(first.id);
    const secondAttempt = deleteSaveAndPersist(second.id);
    await vi.waitFor(() => expect(native.write).toHaveBeenCalledOnce());
    expect(cache.getItem(SAVE_KEY)).not.toBe('[]');
    const rejected = expect(firstAttempt).rejects.toThrow(); release(); await rejected;
    expect((await secondAttempt).saves.map((slot) => slot.id)).toEqual([first.id]);
    await cache.flush!();
    expect(JSON.parse(disk.get(SAVE_KEY)!).map((slot: { id: number }) => slot.id)).toEqual([first.id]);
  });
});
