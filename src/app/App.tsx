import { useState } from 'react';
import { AudioDirector } from '../audio/AudioDirector';
import { ApiConfigModal } from '../components/shared/ApiConfigModal';
import { CharacterSetup } from '../components/setup/CharacterSetup';
import { TitleScreen } from '../components/setup/TitleScreen';
import type { Investigator } from '../types/game';
import { GameScreen } from './GameScreen';
import { useGameController } from './useGameController';
import { usePortraitLayout } from '../platform/layout';
import { continuationPreview, type GameContinuation } from './gameContinuation';

type Screen = 'title' | 'setup' | 'game';

export function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [continuation, setContinuation] = useState<GameContinuation | null>(null);
  const game = useGameController();
  const portrait = usePortraitLayout();

  function startGame(players: Investigator[]) {
    game.startGame(players);
    setContinuation(null);
    setScreen('game');
  }

  function loadLatest() {
    if (continuation) { game.restoreSession(continuation.state, continuation.roll); setScreen('game'); }
    else if (game.loadLatest()) setScreen('game');
  }

  return (
    <>
      <AudioDirector screen={screen} state={game.state} roll={game.diceRoll} />
      {screen === 'title' ? <>
        <TitleScreen
          hasSaves={Boolean(continuation) || game.saves.length > 0}
          continuation={continuation ? continuationPreview(continuation.state) : undefined}
          latestSave={game.saves[0]}
          onLoadLatest={loadLatest}
          onNewGame={() => { game.restartSetup(); setScreen('setup'); }}
          onOpenApi={game.openApiSettings}
          overlayOpen={game.apiOpen}
        />
        <ApiConfigModal open={game.apiOpen} onClose={() => game.setApiOpen(false)} onSave={game.saveApi} />
        {game.toast ? <div className="toast" role="status">{game.toast}</div> : null}
      </> : screen === 'setup' ? <CharacterSetup portrait={portrait} onBack={() => setScreen('title')} onStart={startGame} /> : <GameScreen
        autoFocusInput={!portrait}
        portrait={portrait}
        controller={game}
        onHome={(snapshot) => { setContinuation(snapshot); setScreen('title'); }}
        onRestart={(snapshot) => { setContinuation(snapshot); setScreen('setup'); }}
      />}
    </>
  );
}
