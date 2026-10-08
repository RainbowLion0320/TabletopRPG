import { useCallback, useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { AudioDirector } from '../audio/AudioDirector';
import { gameAudio } from '../audio/audio';
import { ApiConfigModal } from '../components/shared/ApiConfigModal';
import { useDialogFocus } from '../components/shared/useDialogFocus';
import { CharacterSetup } from '../components/setup/CharacterSetup';
import { TitleScreen } from '../components/setup/TitleScreen';
import { GameScreen } from '../app/GameScreen';
import { useGameController } from '../app/useGameController';
import { readApiConfig } from '../services/storage';
import { flushGameStorage } from '../platform/storage';
import { isNativeAndroid } from './native';
import { readMobileSession, writeMobileSession, type MobileSession } from './session';
import { continuationPreview, type GameContinuation } from '../app/gameContinuation';
import type { Investigator } from '../types/game';

type Screen = 'title' | 'setup' | 'game';
export function AndroidApp() {
  const [screen, setScreen] = useState<Screen>('title');
  const [session, setSession] = useState<MobileSession | null>(null);
  const [notice, setNotice] = useState('');
  const [exitOpen, setExitOpen] = useState(false);
  const game = useGameController();
  const exitRef = useRef<HTMLDivElement>(null);
  const lastSession = useRef<Promise<MobileSession> | null>(null);
  const backHandler = useRef(() => {});
  useDialogFocus(exitOpen, exitRef, () => setExitOpen(false));

  const rememberSession = useCallback(({ state, roll }: GameContinuation) => {
    // Keep the current investigation usable before disk I/O settles or fails.
    setSession({ version: 1, savedAt: Date.now(), state, roll });
    const write = writeMobileSession(state, roll);
    lastSession.current = write;
    void write.then(value => { if (lastSession.current === write) setSession(value); })
      .catch(() => { if (lastSession.current === write) setNotice('自动保存失败，请检查设备存储空间。当前游戏仍可继续。'); });
  }, []);

  useEffect(() => {
    try { setSession(readMobileSession()); }
    catch (error) { setNotice(error instanceof Error ? error.message : '无法读取自动续玩记录，请使用手动存档。'); }
  }, []);
  useEffect(() => {
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
    setExitOpen(true);
  };
  useEffect(() => {
    if (!isNativeAndroid()) return;
    const listeners = [
      NativeApp.addListener('backButton', () => backHandler.current()),
      NativeApp.addListener('appStateChange', ({ isActive }) => {
        gameAudio.setVisible(isActive);
        if (!isActive) void flushGameStorage().catch(() => setNotice('保存失败，请检查设备存储空间。'));
      }),
    ];
    return () => { listeners.forEach(listener => { void listener.then(handle => handle.remove()); }); };
  }, []);

  const configureIfNeeded = () => { if (!readApiConfig()) game.setApiOpen(true); };
  const start = (players: Investigator[]) => {
    game.startGame(players); setScreen('game'); setNotice(''); configureIfNeeded();
  };
  const resume = () => {
    if (session) { game.restoreSession(session.state, session.roll); setScreen('game'); configureIfNeeded(); }
    else if (game.loadLatest()) { setScreen('game'); configureIfNeeded(); }
  };
  const exit = async () => {
    try { await flushGameStorage(); await NativeApp.exitApp(); }
    catch { setExitOpen(false); setNotice('保存尚未完成，请稍后再退出。'); }
  };
  return <>
    <AudioDirector screen={screen} state={game.state} roll={game.diceRoll} />
    {screen === 'title' ? <>
      <TitleScreen hasSaves={Boolean(session) || game.saves.length > 0} latestSave={game.saves[0]}
        continuation={session ? continuationPreview(session.state) : undefined}
        onLoadLatest={resume} onNewGame={() => setScreen('setup')} onOpenApi={game.openApiSettings} />
      <ApiConfigModal open={game.apiOpen} onClose={() => game.setApiOpen(false)} onSave={game.saveApi} />
    </> : screen === 'setup' ? <CharacterSetup portrait onBack={() => setScreen('title')} onStart={start} /> :
      <GameScreen controller={game} portrait autoFocusInput={false}
        onHome={(snapshot) => { rememberSession(snapshot); setScreen('title'); }}
        onRestart={(snapshot) => { rememberSession(snapshot); setScreen('setup'); }} />}
    {notice && <div className="android-notice" role="alert"><span>{notice}</span><button onClick={() => setNotice('')}>知道了</button></div>}
    {screen !== 'game' && game.toast && <div className="toast" role="status">{game.toast}</div>}
    {exitOpen && <div className="modal-backdrop"><div ref={exitRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="exit-title" tabIndex={-1}>
      <h2 id="exit-title">结束本次调查？</h2><p>下次打开可从首页继续游戏。</p>
      <footer><button className="ghost-btn" onClick={() => setExitOpen(false)}>留下</button><button className="primary-btn" onClick={() => void exit()}>退出游戏</button></footer>
    </div></div>}
  </>;
}
