import { Menu } from 'lucide-react';
import type { GameState } from '../../types/game';
import { storyData } from '../../data/storyData';
import { getScenarioDefinition, getScenarioProgressForState } from '../../scenario/engine';

interface TopBarProps {
  state: GameState;
  onToggleMenu: () => void;
}

export function TopBar({ state, onToggleMenu }: TopBarProps) {
  const scene = storyData.scenes[state.currentScene];
  const scenario = getScenarioDefinition();
  const progress = getScenarioProgressForState(state);
  const act = scenario.progression.acts.find((item) => item.id === progress.activeActId);
  const worldTime = progress.worldTime.replace('T', ' ');
  return (
    <header className="game-top">
      <div className="brand-block">
        <div className="brand-title">{act?.title ?? scene.chapterTitle}</div>
        <div className="brand-scene">{scene.name}</div>
        <div className="world-time">{worldTime}</div>
      </div>
      <button className="menu-button" onClick={onToggleMenu} title="菜单">
        <Menu size={18} />
      </button>
    </header>
  );
}
