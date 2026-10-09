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
import type { ApiConfig, GameState, Investigator } from '../types/game';
import { AiProviderConfigError } from '../dm/llm/errors';
import { runDmTurn } from '../dm/pipeline';
import type { DmBackgroundUpdate } from '../dm/types';
import { DmTurnCoordinator } from './dmTurnCoordinator';
import type { DmSessionTask } from './dmTurnCoordinator';
import { getApiConfigValidationError } from '../config/aiConfig';
import { dmConnectionFailureText } from '../services/narrativeVisibility';
import {
  DICE_ROLL_DURATION_MS,
  type DiceRollPresentation
} from './diceRollAnimation';

const AI_DM_TIMEOUT_MS = 180_000;

export function useGameController() {
  const { clearToast, notify, toast } = useToast();
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
  const foregroundTaskRef = useRef<DmSessionTask | null>(null);
  const submittedStateRef = useRef<GameState | null>(null);

  useEffect(() => () => {
    dmCoordinatorRef.current.invalidate();
    diceRollInFlightRef.current = false;
  }, []);

  useEffect(() => {
    if (!diceRoll || diceRoll.phase !== 'rolling') return;
    const revealAt = diceRoll.revealAt ?? Date.now() + DICE_ROLL_DURATION_MS;
    const revealIfDue = () => {
      if (Date.now() < revealAt) return;
      setDiceRoll((current) => current?.phase === 'rolling'
        ? { ...current, phase: 'revealed', revealAt: undefined }
        : current);
    };
    const revealTimer = window.setTimeout(revealIfDue, Math.max(0, revealAt - Date.now()));
    window.addEventListener('focus', revealIfDue);
    window.addEventListener('pointerdown', revealIfDue, true);
    window.addEventListener('keydown', revealIfDue, true);
    document.addEventListener('visibilitychange', revealIfDue);
    return () => {
      window.clearTimeout(revealTimer);
      window.removeEventListener('focus', revealIfDue);
      window.removeEventListener('pointerdown', revealIfDue, true);
      window.removeEventListener('keydown', revealIfDue, true);
      document.removeEventListener('visibilitychange', revealIfDue);
    };
  }, [diceRoll]);

  function cancelDiceRoll() {
    clearToast();
    foregroundTaskRef.current = null;
    submittedStateRef.current = null;
    diceRollInFlightRef.current = false;
    setDiceRoll(null);
    setDrawerOpen(false);
    setJournalOpen(false);
    setSaveManagerOpen(false);
    setApiOpen(false);
  }

  function startGame(players: Investigator[]) {
    cancelDiceRoll();
    dmCoordinatorRef.current.invalidate();
    dispatch({ type: 'start', players });
  }

  function restoreSession(restoredState: GameState, restoredRoll: DiceRollPresentation | null) {
    cancelDiceRoll();
    dmCoordinatorRef.current.invalidate();
    dispatch({ type: 'restore', state: restoredState });
    if (restoredRoll) {
      diceRollInFlightRef.current = true;
      setDiceRoll({ ...restoredRoll, phase: 'revealed', revealAt: undefined });
    }
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
    if (diceRollInFlightRef.current) {
      notify('请先确认本次掷骰结果，再保存。');
      return;
    }
    saveSlots.saveCurrentGame(state);
    setMenuOpen(false);
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
    if (!state.players.length || state.pendingCheck || state.pendingDmActions?.length
      || state.isThinking || foregroundTaskRef.current || state.scenarioProgress?.endingId
      || diceRollInFlightRef.current || submittedStateRef.current === state) return;

    // Players declare sequentially, then the complete party turn is resolved once.
    const actor = state.players[state.currentActorIndex];
    if (!actor) return;
    const declaration = state.declarations[actor.id]?.trim();
    if (!declaration) return;
    const isLast = state.currentActorIndex >= state.players.length - 1;
    if (isLast && !requireApiConfig()) return;
    submittedStateRef.current = state;

    dispatch({
      type: 'appendMessage',
      message: { type: 'player', text: declaration, playerName: actor.name }
    });

    if (!isLast) {
      dispatch({ type: 'advanceActor' });
      return;
    }

    // Last actor: aggregate every declaration and run one DM round for the party.
    const actions = buildPlayerActions(state);
    const historyAction = { type: 'appendHistory' as const, role: 'user' as const, content: buildUserMessage(actions) };
    dispatch(historyAction);
    dispatch({ type: 'clearDeclarations' });
    void runAi(actions, gameReducer(state, historyAction));
  }

  function applyBackgroundUpdate(update: DmBackgroundUpdate, sourceHistory: GameState['conversationHistory']) {
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
        sourceHistory
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

  function requireApiConfig(): ApiConfig | null {
    const config = readApiConfig();
    const validation = config ? getApiConfigValidationError(config) : '请先在菜单中配置 AI API Key。';
    if (validation) {
      setApiOpen(true);
      return null;
    }
    return config;
  }

  async function runAi(actions: PlayerAction[], turnState: GameState = state) {
    if (foregroundTaskRef.current) return;
    dispatch({ type: 'setPendingDmActions', actions });
    const config = requireApiConfig();
    if (!config) return;
    const coordinator = dmCoordinatorRef.current;
    const task = coordinator.begin(AI_DM_TIMEOUT_MS);
    foregroundTaskRef.current = task;
    try {
      dispatch({ type: 'setThinking', value: true });
      // Keep automatic recovery, but cap the fallback to one fresh attempt
      // instead of nesting three full two-attempt Narrator runs.
      let turnResult: Awaited<ReturnType<typeof runDmTurn>>;
      try {
        turnResult = await coordinator.waitFor(task, runDmTurn(config, {
          state: turnState, actions, signal: task.controller.signal
        }));
      } catch (error) {
        if (!(error instanceof AiResponseFormatError) || !coordinator.isCurrent(task)) throw error;
        turnResult = await coordinator.waitFor(task, runDmTurn(config, {
          state: turnState, actions, signal: task.controller.signal, narratorAttempts: 1,
          retryCorrection: error.retryCorrection
        }));
      }
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
        randomSeed: Math.random(),
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
          (update) => applyBackgroundUpdate(update, turnState.conversationHistory),
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
      if (!coordinator.isSessionCurrent(task)) {
        coordinator.finish(task);
        return;
      }
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
        setMenuOpen(false);
        setApiOpen(true);
        return;
      }
      const prefix = error instanceof AiResponseFormatError ? 'AI DM 返回格式无效' : 'AI DM 连接失败';
      if (import.meta.env.DEV) console.warn('[AI DM] turn recovery exhausted:', error);
      dispatch({
        type: 'appendMessage',
        message: { type: 'system', text: error instanceof AiResponseFormatError
          ? `${prefix}：DM 暂时未能完成本轮回应，请重试。`
          : `${prefix}：${dmConnectionFailureText(error)}` }
      });
    } finally {
      if (foregroundTaskRef.current === task) foregroundTaskRef.current = null;
    }
  }

  function retryPendingTurn() {
    if (!state.pendingDmActions?.length || state.isThinking || state.pendingCheck
      || state.scenarioProgress?.endingId) return;
    void runAi(state.pendingDmActions);
  }

  function handleRoll() {
    if (!state.pendingCheck || state.isThinking || state.scenarioProgress?.endingId || diceRollInFlightRef.current) return;
    const check = state.pendingCheck;
    const result = rollD100(check);
    diceRollInFlightRef.current = true;
    setDiceRoll({
      check,
      result,
      phase: 'rolling',
      revealAt: Date.now() + DICE_ROLL_DURATION_MS
    });
  }

  function confirmDiceResult() {
    if (!diceRoll || diceRoll.phase !== 'revealed' || !diceRollInFlightRef.current) return;
    const { check, result } = diceRoll;
    const checkMessage = buildDiceResultMessage(check, result);
    const resultAction = buildDiceResultAction(state, check, checkMessage, result);
    const diceAction = { type: 'applyDiceResult' as const, result, resultAction, randomSeed: Math.random() };
    const rolledState = gameReducer(state, diceAction);
    const continuationState = gameReducer(rolledState, {
      type: 'appendHistory',
      role: 'user',
      content: checkMessage
    });
    diceRollInFlightRef.current = false;
    setDiceRoll(null);
    dispatch(diceAction);
    dispatch({ type: 'appendHistory', role: 'user', content: checkMessage });
    if (rolledState.pendingCheck || rolledState.scenarioProgress?.endingId) return;
    void runAi([
      ...(check.continuationActions ?? []),
      ...(check.resolvedActions ?? []),
      resultAction
    ], continuationState);
  }

  function applySuggestion(text: string) {
    const playerId = findSuggestionTargetPlayerId(state);
    if (playerId) dispatch({ type: 'setDeclaration', playerId, text });
  }

  async function saveApi(config: ApiConfig) {
    await persistApiConfig(config);
    setApiOpen(false);
    notify('AI 设置已保存');
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

  function setDeclaration(playerId: string, text: string) {
    dispatch({ type: 'setDeclaration', playerId, text });
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
    incompatibleSaves: saveSlots.incompatibleSaves,
    journalOpen,
    loadLatest,
    loadSaveSlot,
    menuOpen,
    openApiSettings,
    openJournal,
    openSaveManager,
    refreshSaves: saveSlots.refreshSaves,
    restartSetup,
    restoreSession,
    retryPendingTurn,
    returnHome,
    saveApi,
    saveCurrentGame,
    saveManagerOpen,
    saves: saveSlots.saves,
    setApiOpen,
    setDeclaration,
    setDrawerOpen,
    setMenuOpen,
    setSaveManagerOpen,
    startGame,
    state,
    submitAction,
    toast
  };
}

export type GameController = ReturnType<typeof useGameController>;
