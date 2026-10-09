import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { AudioDirector } from '../audio/AudioDirector';
import { gameAudio } from '../audio/audio';
import { ApiConfigModal } from '../components/shared/ApiConfigModal';
import { ExitGameDialog } from './ExitGameDialog';
import { CharacterSetup } from '../components/setup/CharacterSetup';
import { TitleScreen } from '../components/setup/TitleScreen';
import { GameScreen } from '../app/GameScreen';
import { useGameController } from '../app/useGameController';
import { readApiConfig } from '../services/storage';
import { flushGameStorage } from '../platform/storage';
import { isNativeAndroid } from './native';
import { readMobileSession, writeMobileSession, type MobileSession } from './session';
import { continuationPreview, type GameContinuation } from '../app/gameContinuation';
import type { GameState, Investigator } from '../types/game';
import './android-feedback.css';

type Screen = 'title' | 'setup' | 'game';
type SessionCheckpoint = { snapshot: GameContinuation; revision: number };

function onlyDeclarationChanged(previous: GameContinuation, next: GameContinuation): boolean {
  if (previous.roll !== next.roll || previous.state.declarations === next.state.declarations) return false;
  const keys = new Set([...Object.keys(previous.state), ...Object.keys(next.state)]);
  return Array.from(keys).every(key => key === 'declarations'
    || previous.state[key as keyof GameState] === next.state[key as keyof GameState]);
}

export function AndroidApp({ partialRecovery = false }: { partialRecovery?: boolean }) {
  const [screen, setScreen] = useState<Screen>('title');
  const [session, setSession] = useState<MobileSession | null>(null);
  const [notice, setNotice] = useState(partialRecovery ? '部分本机记录暂时无法读取，其他有效存档仍可继续。' : '');
  const [exitOpen, setExitOpen] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitError, setExitError] = useState('');
  const game = useGameController();
  const exitingRef = useRef(false);
  const sessionRevision = useRef(0);
  const lastSnapshot = useRef<GameContinuation | null>(null);
  const pendingDraft = useRef<SessionCheckpoint | null>(null);
  const draftTimer = useRef<number | undefined>(undefined);
  const backHandler = useRef(() => {});

  const persistCheckpoint = useCallback(({ snapshot, revision }: SessionCheckpoint) => {
    void writeMobileSession(snapshot.state, snapshot.roll)
      .then(value => { if (sessionRevision.current === revision) setSession(value); })
      .catch(() => { if (sessionRevision.current === revision) setNotice('自动保存失败，请检查设备存储空间。当前游戏仍可继续。'); });
  }, []);
  const flushDraft = useCallback(() => {
    window.clearTimeout(draftTimer.current); draftTimer.current = undefined;
    const checkpoint = pendingDraft.current; pendingDraft.current = null;
    if (checkpoint) persistCheckpoint(checkpoint);
  }, [persistCheckpoint]);
  const rememberSession = useCallback((snapshot: GameContinuation, immediate = false) => {
    const previous = lastSnapshot.current; lastSnapshot.current = snapshot;
    const checkpoint = { snapshot, revision: ++sessionRevision.current };
    // Live continuation always reflects the newest draft, including during disk failure.
    setSession({ version: 1, savedAt: Date.now(), ...snapshot });
    if (!immediate && previous && onlyDeclarationChanged(previous, snapshot)) {
      pendingDraft.current = checkpoint;
      // A bounded window groups keystrokes without postponing continuous typing forever.
      draftTimer.current ??= window.setTimeout(flushDraft, 250);
    } else {
      window.clearTimeout(draftTimer.current); draftTimer.current = undefined; pendingDraft.current = null;
      persistCheckpoint(checkpoint);
    }
  }, [flushDraft, persistCheckpoint]);
  useEffect(() => {
    window.addEventListener('pagehide', flushDraft);
    return () => { window.removeEventListener('pagehide', flushDraft); flushDraft(); };
  }, [flushDraft]);

  useEffect(() => {
    try { setSession(readMobileSession()); }
    catch (error) {
      if (import.meta.env.DEV) console.warn('[session] 无法读取自动续玩记录', error);
      setNotice('自动续玩记录暂时无法读取，请使用手动存档继续。');
    }
  }, []);
  useLayoutEffect(() => {
    if (screen !== 'game' || !game.state.players.length) return;
    rememberSession({ state: game.state, roll: game.diceRoll });
  }, [screen, game.state, game.diceRoll, rememberSession]);

  backHandler.current = () => {
    const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
    if (dialogs.length) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; }
    if (game.drawerOpen) { game.setDrawerOpen(false); return; }
    if (game.menuOpen) { game.setMenuOpen(false); return; }
    if (screen === 'game') { game.setMenuOpen(true); return; }
    if (screen === 'setup') { setScreen('title'); return; }
    setExitError(''); setExitOpen(true);
  };
  useEffect(() => {
    if (!isNativeAndroid()) return;
    const listeners = [
      NativeApp.addListener('backButton', () => backHandler.current()),
      NativeApp.addListener('appStateChange', ({ isActive }) => {
        gameAudio.setVisible(isActive);
        if (!isActive) {
          flushDraft();
          void flushGameStorage().catch(() => setNotice('保存失败，请检查设备存储空间。'));
        }
      }),
    ];
    return () => { listeners.forEach(listener => { void listener.then(handle => handle.remove()); }); };
  }, [flushDraft]);

  const configureIfNeeded = (state?: GameState) => {
    if (state && continuationPreview(state).completed) return;
    if (!readApiConfig()) game.setApiOpen(true);
  };
  const start = (players: Investigator[]) => {
    game.startGame(players); setScreen('game'); setNotice(''); configureIfNeeded();
  };
  const resume = () => {
    if (session) { game.restoreSession(session.state, session.roll); setScreen('game'); configureIfNeeded(session.state); }
    else if (game.loadLatest()) { setScreen('game'); configureIfNeeded(game.saves[0]?.gameState); }
  };
  const exit = async () => {
    if (exitingRef.current) return;
    exitingRef.current = true; setExitBusy(true); setExitError('');
    try { flushDraft(); await flushGameStorage(); await NativeApp.exitApp(); setExitOpen(false); }
    catch { setExitError('保存尚未完成，请稍后再退出。'); }
    finally { exitingRef.current = false; setExitBusy(false); }
  };
  const closeExit = () => { if (!exitingRef.current) { setExitOpen(false); setExitError(''); } };
  return <>
    <AudioDirector screen={screen} state={game.state} roll={game.diceRoll} />
    {screen === 'title' ? <>
      <TitleScreen hasSaves={Boolean(session) || game.saves.length > 0} latestSave={game.saves[0]}
        continuation={session ? continuationPreview(session.state) : undefined}
        onLoadLatest={resume} onNewGame={() => setScreen('setup')} onOpenApi={game.openApiSettings} />
      <ApiConfigModal open={game.apiOpen} onClose={() => game.setApiOpen(false)} onSave={game.saveApi} />
    </> : screen === 'setup' ? <CharacterSetup portrait onBack={() => setScreen('title')} onStart={start} /> :
      <GameScreen controller={{ ...game, saveCurrentGame: () => { flushDraft(); game.saveCurrentGame(); } }} portrait autoFocusInput={false}
        onHome={(snapshot) => { rememberSession(snapshot, true); setScreen('title'); }}
        onRestart={(snapshot) => { rememberSession(snapshot, true); setScreen('setup'); }} />}
    {notice && <div className="android-notice" role="alert"><span>{notice}</span><button className="secondary-action" onClick={() => setNotice('')}>知道了</button></div>}
    {screen !== 'game' && game.toast && <div className="toast" role="status">{game.toast}</div>}
    <ExitGameDialog open={exitOpen} busy={exitBusy} error={exitError} onClose={closeExit} onExit={() => void exit()} />
  </>;
}
