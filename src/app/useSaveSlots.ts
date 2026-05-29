import { useState } from 'react';
import { deleteSave, readSaves, saveGameState } from '../services/storage';
import type { GameState } from '../types/game';

export function useSaveSlots(notify: (text: string) => void) {
  const [saves, setSaves] = useState(() => readSaves());

  function refreshSaves() {
    const latestSaves = readSaves();
    setSaves(latestSaves);
    return latestSaves;
  }

  function getLatestSave() {
    return refreshSaves()[0] ?? null;
  }

  function saveCurrentGame(gameState: GameState) {
    saveGameState(gameState);
    refreshSaves();
    notify('已保存');
  }

  function deleteSaveSlot(id: number) {
    setSaves(deleteSave(id));
    notify('已删除存档');
  }

  return {
    deleteSaveSlot,
    getLatestSave,
    refreshSaves,
    saveCurrentGame,
    saves
  };
}

