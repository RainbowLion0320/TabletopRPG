import { useState } from 'react';
import { AudioDirector } from '../audio/AudioDirector';
import { ApiConfigModal } from '../components/shared/ApiConfigModal';
import { CharacterSetup } from '../components/setup/CharacterSetup';
import { TitleScreen } from '../components/setup/TitleScreen';
import type { Investigator } from '../types/game';
import { GameScreen } from './GameScreen';
import { useGameController } from './useGameController';

type Screen = 'title' | 'setup' | 'game';

export function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const game = useGameController();

  function startGame(players: Investigator[]) {
    game.startGame(players);
    setScreen('game');
  }

  function loadLatest() {
    if (game.loadLatest()) setScreen('game');
  }

  return (
    <>
      <AudioDirector screen={screen} state={game.state} roll={game.diceRoll} />
      {screen === 'title' ? <>
        <TitleScreen
          hasSaves={game.saves.length > 0}
          latestSave={game.saves[0]}
          onLoadLatest={loadLatest}
          onNewGame={() => setScreen('setup')}
          onOpenApi={game.openApiSettings}
        />
        <ApiConfigModal open={game.apiOpen} onClose={() => game.setApiOpen(false)} onSave={game.saveApi} />
        {game.toast ? <div className="toast" role="status">{game.toast}</div> : null}
      </> : screen === 'setup' ? <CharacterSetup onBack={() => setScreen('title')} onStart={startGame} /> : <GameScreen
        controller={game}
        onHome={() => setScreen('title')}
        onRestart={() => setScreen('setup')}
      />}
    </>
  );
}
