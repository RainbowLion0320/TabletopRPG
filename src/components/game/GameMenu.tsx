import { BookOpen, Home, RotateCcw, Save, Settings } from 'lucide-react';
import type { ExploreMode } from '../../types/game';

interface GameMenuProps {
  open: boolean;
  mode: ExploreMode;
  onModeChange: (mode: ExploreMode) => void;
  onSave: () => void;
  onLoad: () => void;
  onOpenApi: () => void;
  onRestart: () => void;
  onHome: () => void;
}

export function GameMenu({ mode, onHome, onLoad, onModeChange, onOpenApi, onRestart, onSave, open }: GameMenuProps) {
  return (
    <aside className={`game-menu ${open ? 'open' : ''}`}>
      <div className="menu-group">
        <p>探索模式</p>
        <div className="mode-segment">
          <button className={mode === 'together' ? 'active' : ''} onClick={() => onModeChange('together')}>一起行动</button>
          <button className={mode === 'split' ? 'active' : ''} onClick={() => onModeChange('split')}>分头探索</button>
        </div>
      </div>
      <div className="menu-list">
        <button onClick={onSave}><Save size={16} />保存游戏</button>
        <button onClick={onLoad}><BookOpen size={16} />读取存档</button>
        <button onClick={onOpenApi}><Settings size={16} />AI 设置</button>
        <button onClick={onRestart}><RotateCcw size={16} />重新开始</button>
        <button onClick={onHome}><Home size={16} />返回首页</button>
      </div>
    </aside>
  );
}
