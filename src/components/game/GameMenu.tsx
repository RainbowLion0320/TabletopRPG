import { BookOpen, FolderOpen, Home, NotebookPen, RotateCcw, Save, Settings } from 'lucide-react';

interface GameMenuProps {
  open: boolean;
  onSave: () => void;
  onLoad: () => void;
  onManageSaves: () => void;
  onOpenApi: () => void;
  onOpenJournal: () => void;
  onRestart: () => void;
  onHome: () => void;
}

export function GameMenu({ onHome, onLoad, onManageSaves, onOpenApi, onOpenJournal, onRestart, onSave, open }: GameMenuProps) {
  return (
    <aside className={`game-menu ${open ? 'open' : ''}`}>
      <div className="menu-list">
        <button onClick={onSave}><Save size={16} />保存游戏</button>
        <button onClick={onLoad}><BookOpen size={16} />读取存档</button>
        <button onClick={onManageSaves}><FolderOpen size={16} />存档管理</button>
        <button onClick={onOpenJournal}><NotebookPen size={16} />KP 笔记</button>
        <button onClick={onOpenApi}><Settings size={16} />AI 设置</button>
        <button onClick={onRestart}><RotateCcw size={16} />重新开始</button>
        <button onClick={onHome}><Home size={16} />返回首页</button>
      </div>
    </aside>
  );
}
