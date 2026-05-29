import { ActionDock } from '../components/game/ActionDock';
import { GameMenu } from '../components/game/GameMenu';
import { InfoDrawer } from '../components/game/InfoDrawer';
import { NarrativePanel } from '../components/game/NarrativePanel';
import { PartyStrip } from '../components/game/PartyStrip';
import { SaveManagerModal } from '../components/game/SaveManagerModal';
import { SceneStage } from '../components/game/SceneStage';
import { TopBar } from '../components/game/TopBar';
import { ApiConfigModal } from '../components/shared/ApiConfigModal';
import type { SceneId } from '../types/game';
import type { GameController } from './useGameController';

interface GameScreenProps {
  controller: GameController;
  onHome: () => void;
  onRestart: () => void;
}

export function GameScreen({ controller, onHome, onRestart }: GameScreenProps) {
  const { state } = controller;

  function handleHome() {
    controller.returnHome();
    onHome();
  }

  function handleRestart() {
    controller.restartSetup();
    onRestart();
  }

  return (
    <main className="game-screen">
      <SceneStage state={state} />
      <TopBar state={state} onToggleMenu={() => controller.setMenuOpen(!controller.menuOpen)} />
      <GameMenu
        mode={state.exploreMode}
        open={controller.menuOpen}
        onHome={handleHome}
        onLoad={controller.loadCurrentLatest}
        onManageSaves={controller.openSaveManager}
        onModeChange={controller.setExploreMode}
        onOpenApi={controller.openApiSettings}
        onRestart={handleRestart}
        onSave={controller.saveCurrentGame}
      />
      <SaveManagerModal
        open={controller.saveManagerOpen}
        saves={controller.saves}
        onClose={() => controller.setSaveManagerOpen(false)}
        onDelete={controller.deleteSaveSlot}
        onLoad={(save) => controller.loadSaveSlot(save.gameState)}
      />
      <InfoDrawer
        open={controller.drawerOpen}
        state={state}
        onClose={() => controller.setDrawerOpen(false)}
        onOpen={() => controller.setDrawerOpen(true)}
      />
      <NarrativePanel state={state} />
      <ActionDock
        state={state}
        onDeclarationChange={controller.setDeclaration}
        onRoll={controller.handleRoll}
        onSplitPlayerChange={controller.setCurrentSplitPlayer}
        onSplitSceneChange={(playerIndex, sceneId: SceneId) => controller.setPlayerScene(playerIndex, sceneId)}
        onSubmit={controller.submitAction}
        onSuggestion={controller.applySuggestion}
      />
      <PartyStrip state={state} />
      <ApiConfigModal open={controller.apiOpen} onClose={() => controller.setApiOpen(false)} onSave={controller.saveApi} />
      {controller.toast ? <div className="toast">{controller.toast}</div> : null}
    </main>
  );
}
