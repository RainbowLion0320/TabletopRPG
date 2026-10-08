import { useCallback, useState } from 'react';
import { ActionDock } from '../components/game/ActionDock';
import { DmDebugDrawer } from '../components/game/DmDebugDrawer';
import { DiceRollOverlay } from '../components/game/DiceRollOverlay';
import { DmJournalModal } from '../components/game/DmJournalModal';
import { GameMenu } from '../components/game/GameMenu';
import { InfoDrawer } from '../components/game/InfoDrawer';
import { NarrativePanel } from '../components/game/NarrativePanel';
import { EntityDetailModal } from '../components/game/EntityDetailModal';
import { InvestigatorSheet } from '../components/game/InvestigatorSheet';
import { SaveManagerModal } from '../components/game/SaveManagerModal';
import { SceneStage } from '../components/game/SceneStage';
import { TopBar } from '../components/game/TopBar';
import { ApiConfigModal } from '../components/shared/ApiConfigModal';
import type { EntityDetail } from '../dm/entityDetail';
import { getNarrativeMarkDetail } from '../dm/entityDetail';
import type { NarrativeMarkTarget } from '../services/narrativeMarkup';
import type { GameController } from './useGameController';

interface GameScreenProps {
  autoFocusInput?: boolean;
  portrait?: boolean;
  controller: GameController;
  onHome: () => void;
  onRestart: () => void;
}

export function GameScreen({ controller, onHome, onRestart, autoFocusInput = true, portrait = false }: GameScreenProps) {
  const { state } = controller;
  const [narrativeDetail, setNarrativeDetail] = useState<EntityDetail | null>(null);
  const [inspectedPlayerId, setInspectedPlayerId] = useState<string | null>(null);

  const handleNarrativeMarkOpen = useCallback((target: NarrativeMarkTarget, sourceText: string) => {
    const player = target.kind === 'person' && state.players.find((item) => item.id === target.id || item.name === (target.canonicalName ?? target.id));
    if (player) {
      setInspectedPlayerId(player.id);
      return;
    }
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
      <TopBar state={state} menuOpen={controller.menuOpen} onToggleMenu={() => controller.setMenuOpen(!controller.menuOpen)} />
      <GameMenu
        open={controller.menuOpen}
        onClose={() => controller.setMenuOpen(false)}
        onHome={handleHome}
        onLoad={controller.loadCurrentLatest}
        onManageSaves={controller.openSaveManager}
        onOpenApi={controller.openApiSettings}
        onRestart={handleRestart}
        onSave={controller.saveCurrentGame}
      />
      <SaveManagerModal
        open={controller.saveManagerOpen}
        saves={controller.saves}
        incompatibleSaves={controller.incompatibleSaves}
        onClose={() => controller.setSaveManagerOpen(false)}
        onDelete={controller.deleteSaveSlot}
        onLoad={(save) => controller.loadSaveSlot(save.gameState)}
      />
      {import.meta.env.DEV && <DmJournalModal
        open={controller.journalOpen}
        state={state}
        onClose={controller.closeJournal}
      />}
      <InfoDrawer
        open={controller.drawerOpen}
        state={state}
        onClose={() => controller.setDrawerOpen(false)}
        onOpen={() => controller.setDrawerOpen(true)}
      />
      <NarrativePanel state={state} onMarkOpen={handleNarrativeMarkOpen} />
      <ActionDock
        autoFocusInput={autoFocusInput}
        portrait={portrait}
        isDiceRolling={Boolean(controller.diceRoll)}
        state={state}
        onDeclarationChange={controller.setDeclaration}
        onRoll={controller.handleRoll}
        onRetry={controller.retryPendingTurn}
        onSubmit={controller.submitAction}
        onSuggestion={controller.applySuggestion}
        onInspectPlayer={setInspectedPlayerId}
      />
      <DiceRollOverlay onConfirm={controller.confirmDiceResult} roll={controller.diceRoll} />
      <ApiConfigModal open={controller.apiOpen} onClose={() => controller.setApiOpen(false)} onSave={controller.saveApi} />
      <EntityDetailModal detail={narrativeDetail} onClose={() => setNarrativeDetail(null)} />
      {inspectedPlayerId && <InvestigatorSheet players={state.players} selectedId={inspectedPlayerId} onSelect={setInspectedPlayerId} onClose={() => setInspectedPlayerId(null)} />}
      {controller.toast ? <div className="toast">{controller.toast}</div> : null}
      <DmDebugDrawer onOpenJournal={controller.openJournal} />
    </main>
  );
}
