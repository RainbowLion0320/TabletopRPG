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
    saveGameState(gameState);
    refreshSaves();
    notify('已保存');
  }

  function deleteSaveSlot(id: number) {
    setLibrary(deleteSave(id));
    notify('已删除存档');
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
