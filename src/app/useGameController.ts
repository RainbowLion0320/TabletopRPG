import { useReducer, useState } from 'react';
import {
  buildDiceResultAction,
  buildDiceResultMessage,
  buildPlayerActions,
  findSuggestionTargetPlayerId
} from './gameFlow';
import { useSaveSlots } from './useSaveSlots';
import { useToast } from './useToast';
import { AiResponseFormatError, buildUserMessage, callAiDm, type PlayerAction } from '../services/aiDm';
import { prepareCheck, rollD100 } from '../services/dice';
import { readApiConfig, writeApiConfig } from '../services/storage';
import { createInitialGameState, gameReducer } from '../state/gameReducer';
import type { ApiConfig, GameState, Investigator, SceneId } from '../types/game';

export function useGameController() {
  const { notify, toast } = useToast();
  const saveSlots = useSaveSlots(notify);
  const [state, dispatch] = useReducer(gameReducer, null, () => createInitialGameState([]));
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [saveManagerOpen, setSaveManagerOpen] = useState(false);

  function startGame(players: Investigator[]) {
    dispatch({ type: 'start', players });
  }

  function loadLatest() {
    const latest = saveSlots.getLatestSave();
    if (!latest) return false;
    dispatch({ type: 'restore', state: latest.gameState });
    return true;
  }

  function saveCurrentGame() {
    saveSlots.saveCurrentGame(state);
    setMenuOpen(false);
  }

  function loadCurrentLatest() {
    const latest = saveSlots.getLatestSave();
    if (!latest) {
      notify('暂无存档');
      return;
    }
    dispatch({ type: 'restore', state: latest.gameState });
    setMenuOpen(false);
    notify('已载入最近存档');
  }

  function openSaveManager() {
    saveSlots.refreshSaves();
    setMenuOpen(false);
    setSaveManagerOpen(true);
  }

  function loadSaveSlot(save: GameState) {
    dispatch({ type: 'restore', state: save });
    setSaveManagerOpen(false);
    setMenuOpen(false);
    saveSlots.refreshSaves();
    notify('已载入存档');
  }

  function submitAction() {
    if (!state.players.length) return;
    const actions = buildPlayerActions(state);

    actions.forEach((action) => {
      dispatch({
        type: 'appendMessage',
        message: {
          type: 'player',
          text: action.scene ? `[${action.scene}] ${action.action}` : action.action,
          playerName: action.player
        }
      });
    });
    dispatch({ type: 'appendHistory', role: 'user', content: buildUserMessage(actions, state.exploreMode) });
    dispatch({ type: 'clearDeclarations' });
    runAi(actions);
  }

  async function runAi(actions: PlayerAction[]) {
    const config = readApiConfig();
    if (!config?.apiKey) {
      dispatch({ type: 'appendMessage', message: { type: 'system', text: '请先在菜单中配置 AI API Key。' } });
      setApiOpen(true);
      return;
    }
    try {
      dispatch({ type: 'setThinking', value: true });
      const { raw, response } = await callAiDm(config, state, actions);
      const prepared = response.check ? { ...response, check: prepareCheck(response.check, state.players) } : response;
      dispatch({ type: 'applyAiResponse', response: prepared, raw });
    } catch (error) {
      dispatch({ type: 'setThinking', value: false });
      const prefix = error instanceof AiResponseFormatError ? 'AI DM 返回格式无效' : 'AI DM 连接失败';
      dispatch({
        type: 'appendMessage',
        message: { type: 'system', text: `${prefix}：${error instanceof Error ? error.message : String(error)}` }
      });
    }
  }

  function handleRoll() {
    if (!state.pendingCheck) return;
    const check = state.pendingCheck;
    const result = rollD100(check);
    const checkMessage = buildDiceResultMessage(check, result);

    dispatch({ type: 'applyDiceResult', result });
    dispatch({ type: 'setPendingCheck', check: null });
    dispatch({ type: 'appendHistory', role: 'user', content: checkMessage });
    runAi([buildDiceResultAction(state, check, checkMessage)]);
  }

  function applySuggestion(text: string) {
    const playerId = findSuggestionTargetPlayerId(state);
    if (playerId) dispatch({ type: 'setDeclaration', playerId, text });
  }

  function saveApi(config: ApiConfig) {
    writeApiConfig(config);
    setApiOpen(false);
    notify('AI 设置已保存');
  }

  function returnHome() {
    saveSlots.refreshSaves();
    setMenuOpen(false);
  }

  function restartSetup() {
    setMenuOpen(false);
  }

  function openApiSettings() {
    setApiOpen(true);
    setMenuOpen(false);
  }

  function setExploreMode(mode: GameState['exploreMode']) {
    dispatch({ type: 'setExploreMode', mode });
    setMenuOpen(false);
  }

  function setDeclaration(playerId: string, text: string) {
    dispatch({ type: 'setDeclaration', playerId, text });
  }

  function setCurrentSplitPlayer(index: number) {
    dispatch({ type: 'setCurrentSplitPlayer', index });
  }

  function setPlayerScene(playerIndex: number, sceneId: SceneId) {
    dispatch({ type: 'setPlayerScene', playerIndex, sceneId });
  }

  return {
    apiOpen,
    applySuggestion,
    deleteSaveSlot: saveSlots.deleteSaveSlot,
    drawerOpen,
    handleRoll,
    loadCurrentLatest,
    loadLatest,
    loadSaveSlot,
    menuOpen,
    openApiSettings,
    openSaveManager,
    refreshSaves: saveSlots.refreshSaves,
    restartSetup,
    returnHome,
    saveApi,
    saveCurrentGame,
    saveManagerOpen,
    saves: saveSlots.saves,
    setApiOpen,
    setCurrentSplitPlayer,
    setDeclaration,
    setDrawerOpen,
    setExploreMode,
    setMenuOpen,
    setPlayerScene,
    setSaveManagerOpen,
    startGame,
    state,
    submitAction,
    toast
  };
}

export type GameController = ReturnType<typeof useGameController>;

