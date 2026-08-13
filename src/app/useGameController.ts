import { useEffect, useReducer, useRef, useState } from 'react';
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
import { AiProviderConfigError } from '../dm/llm/errors';
import { runDmTurn } from '../dm/pipeline';
import type { DmBackgroundUpdate } from '../dm/types';
import { DmTurnCoordinator } from './dmTurnCoordinator';
import {
  DICE_ROLL_DURATION_MS,
  type DiceRollPresentation
} from './diceRollAnimation';

const AI_DM_TIMEOUT_MS = 180_000;
const AI_DM_FORMAT_ATTEMPTS = 3;

export function useGameController() {
  const { notify, toast } = useToast();
  const saveSlots = useSaveSlots(notify);
  const [state, dispatch] = useReducer(gameReducer, null, () => createInitialGameState([]));
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [saveManagerOpen, setSaveManagerOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [diceRoll, setDiceRoll] = useState<DiceRollPresentation | null>(null);
  const dmCoordinatorRef = useRef(new DmTurnCoordinator());
  const diceRollInFlightRef = useRef(false);

  useEffect(() => () => {
    dmCoordinatorRef.current.invalidate();
    diceRollInFlightRef.current = false;
  }, []);

  useEffect(() => {
    if (!diceRoll || diceRoll.phase !== 'rolling') return;
    const revealTimer = window.setTimeout(() => {
      setDiceRoll((current) => current?.phase === 'rolling'
        ? { ...current, phase: 'revealed' }
        : current);
    }, DICE_ROLL_DURATION_MS);
    return () => window.clearTimeout(revealTimer);
  }, [diceRoll]);

  function cancelDiceRoll() {
    diceRollInFlightRef.current = false;
    setDiceRoll(null);
  }

  function startGame(players: Investigator[]) {
    cancelDiceRoll();
    dmCoordinatorRef.current.invalidate();
    dispatch({ type: 'start', players });
  }

  function loadLatest() {
    const latest = saveSlots.getLatestSave();
    if (!latest) return false;
    cancelDiceRoll();
    dmCoordinatorRef.current.invalidate();
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
    cancelDiceRoll();
    dmCoordinatorRef.current.invalidate();
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
    cancelDiceRoll();
    dmCoordinatorRef.current.invalidate();
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

  function applyBackgroundUpdate(update: DmBackgroundUpdate, sourceHistoryLength: number) {
    const {
      memoryUpdate,
      factsToAppend,
      caseBoardPatch,
      mindUpdates,
      prospectiveIntentsToAdd,
      episodicMemoriesToAdd
    } = update;
    if (memoryUpdate) {
      dispatch({
        type: 'consolidateMemory',
        summary: memoryUpdate.summary,
        summarizedUntilIndex: memoryUpdate.summarizedUntilIndex,
        remainingHistory: memoryUpdate.remainingHistory,
        sourceHistoryLength
      });
    }
    if (factsToAppend && factsToAppend.length) {
      dispatch({ type: 'appendFacts', facts: factsToAppend });
    }
    if (caseBoardPatch) {
      dispatch({ type: 'applyCaseBoardPatch', patch: caseBoardPatch });
    }
    if (mindUpdates && mindUpdates.length) {
      for (const updateItem of mindUpdates) {
        dispatch({ type: 'updateNpcMindModel', npcId: updateItem.npcId, partial: updateItem.partial });
      }
    }
    if (prospectiveIntentsToAdd && prospectiveIntentsToAdd.length) {
      dispatch({ type: 'addProspectiveIntents', intents: prospectiveIntentsToAdd });
    }
    if (episodicMemoriesToAdd && episodicMemoriesToAdd.length) {
      dispatch({ type: 'appendEpisodicMemory', records: episodicMemoriesToAdd });
    }
  }

  async function runAi(actions: PlayerAction[], turnState: GameState = state) {
    const config = readApiConfig();
    if (!config?.apiKey) {
      dispatch({ type: 'appendMessage', message: { type: 'system', text: '请先在菜单中配置 AI API Key。' } });
      setApiOpen(true);
      return;
    }
    const coordinator = dmCoordinatorRef.current;
    const task = coordinator.begin(AI_DM_TIMEOUT_MS);
    try {
      dispatch({ type: 'setThinking', value: true });
      const sourceHistoryLength = turnState.conversationHistory.length;
      let turnResult: Awaited<ReturnType<typeof runDmTurn>> | null = null;
      for (let attempt = 1; attempt <= AI_DM_FORMAT_ATTEMPTS; attempt += 1) {
        try {
          turnResult = await runDmTurn(config, {
            state: turnState,
            actions,
            signal: task.controller.signal
          });
          break;
        } catch (error) {
          const shouldRetry = error instanceof AiResponseFormatError
            && attempt < AI_DM_FORMAT_ATTEMPTS
            && coordinator.isCurrent(task);
          if (!shouldRetry) throw error;
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn(`[useGameController] retrying malformed DM turn (${attempt + 1}/${AI_DM_FORMAT_ATTEMPTS})`);
          }
        }
      }
      if (!turnResult) throw new AiResponseFormatError('DM 引擎连续返回无效格式');
      const {
        raw,
        legacyResponse,
        events,
        actorName,
        decayIntents,
        backgroundUpdate
      } = turnResult;
      if (!coordinator.isCurrent(task)) {
        coordinator.finish(task);
        return;
      }
      if (decayIntents) {
        dispatch({ type: 'decayProspectiveIntents' });
      }
      if (!legacyResponse) {
        // 接线异常：pipeline 未返回可用响应
        throw new Error('DM 引擎未返回可用响应');
      }
      const prepared = legacyResponse.check
        ? { ...legacyResponse, check: prepareCheck(legacyResponse.check, turnState.players) }
        : legacyResponse;
      dispatch({
        type: 'applyAiResponse',
        response: prepared,
        raw,
        actorName: actorName
          ?? actions[actions.length - 1]?.player
          ?? turnState.players[turnState.currentActorIndex]?.name
      });
      if (events && events.length) {
        dispatch({ type: 'appendEvents', events });
      }
      if (backgroundUpdate) {
        void coordinator.enqueue(
          task,
          backgroundUpdate,
          (update) => applyBackgroundUpdate(update, sourceHistoryLength),
          (error) => {
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.warn(
                '[useGameController] AI DM background update failed:',
                error instanceof Error ? error.message : error
              );
            }
          }
        );
      } else {
        coordinator.finish(task);
      }
    } catch (error) {
      if (task.timedOut) {
        coordinator.finish(task);
        dispatch({ type: 'setThinking', value: false });
        dispatch({
          type: 'appendMessage',
          message: { type: 'system', text: 'AI DM 连接超时：推演超过 3 分钟，请检查模型服务后重试。' }
        });
        return;
      }
      if (!coordinator.isCurrent(task)) {
        coordinator.finish(task);
        return;
      }
      coordinator.finish(task);
      dispatch({ type: 'setThinking', value: false });
      if (error instanceof AiProviderConfigError) {
        const message = error.message;
        setMenuOpen(false);
        setApiOpen(true);
        dispatch({
          type: 'appendMessage',
          message: { type: 'system', text: `请补全 AI DM 配置：${message}` }
        });
        return;
      }
      const prefix = error instanceof AiResponseFormatError ? 'AI DM 返回格式无效' : 'AI DM 连接失败';
      dispatch({
        type: 'appendMessage',
        message: { type: 'system', text: `${prefix}：${error instanceof Error ? error.message : String(error)}` }
      });
    }
  }

  function handleRoll() {
    if (!state.pendingCheck || diceRollInFlightRef.current) return;
    const check = state.pendingCheck;
    const result = rollD100(check);
    diceRollInFlightRef.current = true;
    setDiceRoll({ check, result, phase: 'rolling' });
  }

  function confirmDiceResult() {
    if (!diceRoll || diceRoll.phase !== 'revealed' || !diceRollInFlightRef.current) return;
    const { check, result } = diceRoll;
    const checkMessage = buildDiceResultMessage(check, result);
    const rolledState = gameReducer(state, { type: 'applyDiceResult', result });
    const continuationState = gameReducer(rolledState, {
      type: 'appendHistory',
      role: 'user',
      content: checkMessage
    });
    diceRollInFlightRef.current = false;
    setDiceRoll(null);
    dispatch({ type: 'applyDiceResult', result });
    dispatch({ type: 'appendHistory', role: 'user', content: checkMessage });
    if (rolledState.pendingCheck || rolledState.scenarioProgress?.endingId) return;
    runAi([
      ...(check.continuationActions ?? []),
      buildDiceResultAction(state, check, checkMessage)
    ], continuationState);
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
    cancelDiceRoll();
    dmCoordinatorRef.current.invalidate();
    saveSlots.refreshSaves();
    setMenuOpen(false);
  }

  function restartSetup() {
    cancelDiceRoll();
    dmCoordinatorRef.current.invalidate();
    setMenuOpen(false);
  }

  function openApiSettings() {
    setApiOpen(true);
    setMenuOpen(false);
  }

  function openJournal() {
    setJournalOpen(true);
    setMenuOpen(false);
  }

  function closeJournal() {
    setJournalOpen(false);
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

  function setCurrentActor(index: number) {
    dispatch({ type: 'setCurrentActor', index });
  }

  function setPlayerScene(playerIndex: number, sceneId: SceneId) {
    dispatch({ type: 'setPlayerScene', playerIndex, sceneId });
  }

  return {
    apiOpen,
    applySuggestion,
    closeJournal,
    confirmDiceResult,
    deleteSaveSlot: saveSlots.deleteSaveSlot,
    diceRoll,
    drawerOpen,
    handleRoll,
    journalOpen,
    loadCurrentLatest,
    loadLatest,
    loadSaveSlot,
    menuOpen,
    openApiSettings,
    openJournal,
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
    setCurrentActor,
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
