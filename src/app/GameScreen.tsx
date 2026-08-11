import { useCallback, useState } from 'react';
import { ActionDock } from '../components/game/ActionDock';
import { DmDebugDrawer } from '../components/game/DmDebugDrawer';
import { DiceRollOverlay } from '../components/game/DiceRollOverlay';
import { DmJournalModal } from '../components/game/DmJournalModal';
import { GameMenu } from '../components/game/GameMenu';
import { InfoDrawer } from '../components/game/InfoDrawer';
import { NarrativePanel } from '../components/game/NarrativePanel';
import { EntityDetailModal } from '../components/game/EntityDetailModal';
import { SaveManagerModal } from '../components/game/SaveManagerModal';
import { SceneStage } from '../components/game/SceneStage';
import { TopBar } from '../components/game/TopBar';
import { ApiConfigModal } from '../components/shared/ApiConfigModal';
import type { EntityDetail } from '../dm/entityDetail';
import { getNarrativeMarkDetail } from '../dm/entityDetail';
import type { NarrativeMarkTarget } from '../services/narrativeMarkup';
import type { SceneId } from '../types/game';
import type { GameController } from './useGameController';

interface GameScreenProps {
  controller: GameController;
  onHome: () => void;
  onRestart: () => void;
}

export function GameScreen({ controller, onHome, onRestart }: GameScreenProps) {
  const { state } = controller;
  const [narrativeDetail, setNarrativeDetail] = useState<EntityDetail | null>(null);

  const handleNarrativeMarkOpen = useCallback((target: NarrativeMarkTarget, sourceText: string) => {
    setNarrativeDetail(getNarrativeMarkDetail(target, state, sourceText));
  }, [state]);

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
        onOpenJournal={controller.openJournal}
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
      <DmJournalModal
        open={controller.journalOpen}
        state={state}
        onClose={controller.closeJournal}
      />
      <InfoDrawer
        open={controller.drawerOpen}
        state={state}
        onClose={() => controller.setDrawerOpen(false)}
        onOpen={() => controller.setDrawerOpen(true)}
      />
      <NarrativePanel state={state} onMarkOpen={handleNarrativeMarkOpen} />
      <ActionDock
        isDiceRolling={Boolean(controller.diceRoll)}
        state={state}
        onActorChange={controller.setCurrentActor}
        onDeclarationChange={controller.setDeclaration}
        onRoll={controller.handleRoll}
        onSplitPlayerChange={controller.setCurrentSplitPlayer}
        onSplitSceneChange={(playerIndex, sceneId: SceneId) => controller.setPlayerScene(playerIndex, sceneId)}
        onSubmit={controller.submitAction}
        onSuggestion={controller.applySuggestion}
      />
      <DiceRollOverlay onConfirm={controller.confirmDiceResult} roll={controller.diceRoll} />
      <ApiConfigModal open={controller.apiOpen} onClose={() => controller.setApiOpen(false)} onSave={controller.saveApi} />
      <EntityDetailModal detail={narrativeDetail} onClose={() => setNarrativeDetail(null)} />
      {controller.toast ? <div className="toast">{controller.toast}</div> : null}
      <DmDebugDrawer />
    </main>
  );
}
