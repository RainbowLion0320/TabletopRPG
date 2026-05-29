import { useState } from 'react';
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

  if (screen === 'title') {
    return (
      <>
        <TitleScreen
          hasSaves={game.saves.length > 0}
          latestSave={game.saves[0]}
          onLoadLatest={loadLatest}
          onNewGame={() => setScreen('setup')}
          onOpenApi={game.openApiSettings}
        />
        <ApiConfigModal open={game.apiOpen} onClose={() => game.setApiOpen(false)} onSave={game.saveApi} />
      </>
    );
  }

  if (screen === 'setup') {
    return <CharacterSetup onBack={() => setScreen('title')} onStart={startGame} />;
  }

  return (
    <GameScreen
      controller={game}
      onHome={() => setScreen('title')}
      onRestart={() => setScreen('setup')}
    />
  );
}
