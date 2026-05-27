import { useReducer, useRef, useState } from 'react';
import { ActionDock } from '../components/game/ActionDock';
import { ApiConfigModal } from '../components/game/ApiConfigModal';
import { GameMenu } from '../components/game/GameMenu';
import { InfoDrawer } from '../components/game/InfoDrawer';
import { NarrativePanel } from '../components/game/NarrativePanel';
import { PartyStrip } from '../components/game/PartyStrip';
import { SceneStage } from '../components/game/SceneStage';
import { TopBar } from '../components/game/TopBar';
import { CharacterSetup } from '../components/setup/CharacterSetup';
import { TitleScreen } from '../components/setup/TitleScreen';
import { storyData } from '../data/storyData';
import { callAiDm, type PlayerAction } from '../services/aiDm';
import { prepareCheck, rollD100 } from '../services/dice';
import { readApiConfig, readSaves, saveGameState, writeApiConfig } from '../services/storage';
import { createInitialGameState, gameReducer } from '../state/gameReducer';
import type { ApiConfig, GameState, Investigator, SceneId } from '../types/game';

type Screen = 'title' | 'setup' | 'game';

export function App() {
  const [saves, setSaves] = useState(() => readSaves());
  const [screen, setScreen] = useState<Screen>('title');
  const [state, dispatch] = useReducer(gameReducer, null, () => createInitialGameState([]));
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | null>(null);

  function notify(text: string) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => setToast(''), 1800);
  }

  function refreshSaves() {
    const latestSaves = readSaves();
    setSaves(latestSaves);
    return latestSaves;
  }

  function startGame(players: Investigator[]) {
    dispatch({ type: 'start', players });
    setScreen('game');
  }

  function loadLatest() {
    const latest = refreshSaves()[0];
    if (!latest) return;
    dispatch({ type: 'restore', state: latest.gameState });
    setScreen('game');
  }

  function saveCurrentGame() {
    saveGameState(state);
    refreshSaves();
    setMenuOpen(false);
    notify('已保存');
  }

  function loadCurrentLatest() {
    const latest = refreshSaves()[0];
    if (!latest) {
      notify('暂无存档');
      return;
    }
    dispatch({ type: 'restore', state: latest.gameState });
    setMenuOpen(false);
    notify('已载入最近存档');
  }

  function submitAction() {
    if (!state.players.length) return;
    const actions: PlayerAction[] = state.exploreMode === 'together'
      ? state.players.map((player) => ({ player: player.name, action: state.declarations[player.id] || '等待' }))
      : [buildSplitAction(state)];

    const userMessage = state.exploreMode === 'together'
      ? `【本轮行动宣言】\n${actions.map((item) => `${item.player}：${item.action}`).join('\n')}`
      : `【${actions[0].player} 在 ${actions[0].scene}】${actions[0].action}`;

    actions.forEach((action) => {
      dispatch({ type: 'appendMessage', message: { type: 'player', text: action.scene ? `[${action.scene}] ${action.action}` : action.action, playerName: action.player } });
    });
    dispatch({ type: 'appendHistory', role: 'user', content: userMessage });
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
      dispatch({ type: 'appendMessage', message: { type: 'system', text: `AI DM 连接失败：${error instanceof Error ? error.message : String(error)}` } });
    }
  }

  function buildSplitAction(current: GameState): PlayerAction {
    const player = current.players[current.currentSplitPlayer] ?? current.players[0];
    const sceneId = current.playerLocations[player.id] ?? 'S01';
    return {
      player: player.name,
      action: current.declarations[player.id] || '等待',
      scene: storyData.scenes[sceneId].name
    };
  }

  function handleRoll() {
    if (!state.pendingCheck) return;
    const result = rollD100(state.pendingCheck);
    dispatch({ type: 'applyDiceResult', result });
    dispatch({ type: 'setPendingCheck', check: null });

    const check = state.pendingCheck;
    const checkMessage = `【检定结果】${check.player} 的 ${check.skill} 检定：掷出 ${result.roll}，阈值 ${check.threshold}，结果：${result.label}。请根据结果继续叙述。`;
    dispatch({ type: 'appendHistory', role: 'user', content: checkMessage });
    runAi([{ player: check.player, action: checkMessage, scene: storyData.scenes[state.currentScene].name }]);
  }

  function applySuggestion(text: string) {
    if (state.exploreMode === 'split') {
      const player = state.players[state.currentSplitPlayer];
      if (player) dispatch({ type: 'setDeclaration', playerId: player.id, text });
      return;
    }
    const firstEmpty = state.players.find((player) => !state.declarations[player.id]);
    if (firstEmpty) dispatch({ type: 'setDeclaration', playerId: firstEmpty.id, text });
  }

  function saveApi(config: ApiConfig) {
    writeApiConfig(config);
    setApiOpen(false);
    notify('AI 设置已保存');
  }

  if (screen === 'title') {
    return (
      <>
        <TitleScreen
          hasSaves={saves.length > 0}
          latestSave={saves[0]}
          onLoadLatest={loadLatest}
          onNewGame={() => setScreen('setup')}
          onOpenApi={() => setApiOpen(true)}
        />
        <ApiConfigModal open={apiOpen} onClose={() => setApiOpen(false)} onSave={saveApi} />
      </>
    );
  }

  if (screen === 'setup') {
    return <CharacterSetup onBack={() => setScreen('title')} onStart={startGame} />;
  }

  return (
    <main className="game-screen">
      <SceneStage state={state} />
      <TopBar state={state} onToggleMenu={() => setMenuOpen((open) => !open)} />
      <GameMenu
        mode={state.exploreMode}
        open={menuOpen}
        onHome={() => {
          refreshSaves();
          setMenuOpen(false);
          setScreen('title');
        }}
        onLoad={loadCurrentLatest}
        onModeChange={(mode) => {
          dispatch({ type: 'setExploreMode', mode });
          setMenuOpen(false);
        }}
        onOpenApi={() => {
          setApiOpen(true);
          setMenuOpen(false);
        }}
        onRestart={() => setScreen('setup')}
        onSave={saveCurrentGame}
      />
      <InfoDrawer open={drawerOpen} state={state} onClose={() => setDrawerOpen(false)} onOpen={() => setDrawerOpen(true)} />
      <NarrativePanel state={state} />
      <ActionDock
        state={state}
        onDeclarationChange={(playerId, text) => dispatch({ type: 'setDeclaration', playerId, text })}
        onRoll={handleRoll}
        onSplitPlayerChange={(index) => dispatch({ type: 'setCurrentSplitPlayer', index })}
        onSplitSceneChange={(playerIndex, sceneId: SceneId) => dispatch({ type: 'setPlayerScene', playerIndex, sceneId })}
        onSubmit={submitAction}
        onSuggestion={applySuggestion}
      />
      <PartyStrip state={state} />
      <ApiConfigModal open={apiOpen} onClose={() => setApiOpen(false)} onSave={saveApi} />
      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}
