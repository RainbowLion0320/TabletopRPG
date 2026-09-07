import { useState } from 'react';
import { deleteSave, readSaveLibrary, saveGameState } from '../services/storage';
import type { GameState } from '../types/game';

export function useSaveSlots(notify: (text: string) => void) {
  const [library, setLibrary] = useState(() => readSaveLibrary());

  function refreshSaves() {
    const latestLibrary = readSaveLibrary();
    setLibrary(latestLibrary);
    return latestLibrary;
  }

  function getLatestSave() {
    const latestLibrary = refreshSaves();
    if (!latestLibrary.saves.length && latestLibrary.incompatible.length) {
      notify(`存档无法载入：${latestLibrary.incompatible[0].reason}`);
    }
    return latestLibrary.saves[0] ?? null;
  }

  function saveCurrentGame(gameState: GameState) {
    try {
      saveGameState(gameState);
      refreshSaves();
      notify('已保存');
    } catch {
      notify('保存失败：浏览器存储不可用或空间不足，请清理空间后重试。');
    }
  }

  function deleteSaveSlot(id: number) {
    try {
      setLibrary(deleteSave(id));
      notify('已删除存档');
    } catch {
      notify('删除失败：浏览器存储不可用，请稍后重试。');
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
