import { Menu } from 'lucide-react';
import type { GameState } from '../../types/game';
import { storyData } from '../../data/storyData';
import { getScenarioProgressForState } from '../../scenario/engine';
import './top-bar.css';

interface TopBarProps {
  state: GameState;
  onToggleMenu: () => void;
  menuOpen?: boolean;
}

export function TopBar({ state, onToggleMenu, menuOpen = false }: TopBarProps) {
  const scene = storyData.scenes[state.currentScene];
  const progress = getScenarioProgressForState(state);
  const worldTime = progress.worldTime.replace('T', ' ');
  return (
    <header className="game-top">
      <div className="brand-block">
        <div className="brand-title">{scene.chapterTitle}</div>
        <div className="brand-location-row">
          <div className="brand-scene">{scene.name}</div>
          <div className="world-time">{worldTime}</div>
        </div>
      </div>
      <button className="menu-button" onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); onToggleMenu(); }} title="菜单" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls={menuOpen ? 'game-menu-panel' : undefined}>
        <Menu size={18} />
      </button>
    </header>
  );
}
