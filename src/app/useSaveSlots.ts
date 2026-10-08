import { useRef, useState } from 'react';
import { deleteSaveAndPersist, readSaveLibrary, saveGameStateAndPersist } from '../services/storage';
import type { GameState } from '../types/game';

export function useSaveSlots(notify: (text: string) => void) {
  const [library, setLibrary] = useState(() => readSaveLibrary());
  const savingRef = useRef(false);

  function refreshSaves() {
    const latestLibrary = readSaveLibrary();
    setLibrary(latestLibrary);
    return latestLibrary;
  }

  function getLatestSave() {
    const latestLibrary = refreshSaves();
    if (!latestLibrary.saves.length) {
      notify(latestLibrary.incompatible.length
        ? '存档与当前剧情版本不兼容，请在存档管理中查看。'
        : '暂无存档');
    }
    return latestLibrary.saves[0] ?? null;
  }

  async function saveCurrentGame(gameState: GameState) {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      await saveGameStateAndPersist(gameState);
      refreshSaves();
      notify('已保存');
    } catch {
      notify('未能保存，请检查设备存储空间后重试。');
    } finally {
      savingRef.current = false;
    }
  }

  async function deleteSaveSlot(id: number) {
    try {
      const updated = await deleteSaveAndPersist(id);
      setLibrary(updated);
      notify('已删除存档');
      return true;
    } catch {
      return false;
    }
  }

  return {
    deleteSaveSlot,
    getLatestSave,
    incompatibleSaves: library.incompatible,
    refreshSaves,
    saveCurrentGame,
    saves: library.saves
  };
}
