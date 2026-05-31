import { useReducer, useState } from 'react';
import {
  buildDiceResultAction,
  buildDiceResultMessage,
  buildPlayerActions,
  findSuggestionTargetPlayerId
} from './gameFlow';
import { useSaveSlots } from './useSaveSlots';
import { useToast } from './useToast';
import { AiResponseFormatError, buildUserMessage, type PlayerAction } from '../services/aiDm';
import { prepareCheck, rollD100 } from '../services/dice';
import { persistApiConfig, readApiConfig } from '../services/storage';
import { createInitialGameState, gameReducer } from '../state/gameReducer';
import type { ApiConfig, GameState, Investigator, SceneId } from '../types/game';
import { runDmTurn } from '../dm/pipeline';
import { getDmEngineVersion } from '../dm/types';

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

    if (state.exploreMode === 'together') {
      // Sequential turn-taking: each player acts one at a time. The DM is only
      // invoked after every party member has submitted their action.
      const actor = state.players[state.currentActorIndex];
      if (!actor) return;
      const declaration = state.declarations[actor.id]?.trim();
      if (!declaration) return;

      dispatch({
        type: 'appendMessage',
        message: { type: 'player', text: declaration, playerName: actor.name }
      });

      const isLast = state.currentActorIndex >= state.players.length - 1;
      if (!isLast) {
        dispatch({ type: 'advanceActor' });
        return;
      }

      // Last actor: aggregate all declarations and run the DM round.
      const actions = buildPlayerActions(state);
      dispatch({ type: 'appendHistory', role: 'user', content: buildUserMessage(actions, state.exploreMode) });
      dispatch({ type: 'clearDeclarations' });
      runAi(actions);
      return;
    }

    // Split mode: original single-actor flow (one action -> immediate DM).
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
      const version = getDmEngineVersion();
      const { raw, legacyResponse } = await runDmTurn(version, config, { state, actions });
      if (!legacyResponse) {
        // v2 管线仍在建设中；phase 4 会提供 events 返回
        throw new Error('DM 引擎未返回可用响应');
      }
      const prepared = legacyResponse.check
        ? { ...legacyResponse, check: prepareCheck(legacyResponse.check, state.players) }
        : legacyResponse;
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
    setApiOpen(false);
    void persistApiConfig(config).then((envWritten) => {
      notify(envWritten
        ? 'AI 设置已保存并写入 .env.local，下次启动自动生效'
        : 'AI 设置已保存至本地浏览器（环境变量未同步）');
    });
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

