import { Menu } from 'lucide-react';
import type { GameState } from '../../types/game';
import { storyData } from '../../data/storyData';

interface TopBarProps {
  state: GameState;
  onToggleMenu: () => void;
}

export function TopBar({ state, onToggleMenu }: TopBarProps) {
  const scene = storyData.scenes[state.currentScene];
  return (
    <header className="game-top">
      <div className="brand-block">
        <div className="brand-title">{scene.chapterTitle}</div>
        <div className="brand-scene">{scene.name}</div>
      </div>
      <button className="menu-button" onClick={onToggleMenu} title="菜单">
        <Menu size={18} />
      </button>
    </header>
  );
}
