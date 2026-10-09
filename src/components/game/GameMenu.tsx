import { Home, RotateCcw, Settings, X } from 'lucide-react';
import { ArchiveRecordArt } from '../shared/ArchiveRecordArt';
import { JournalArt } from '../shared/JournalArt';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { AudioSettingsButton } from '../shared/AudioSettingsButton';
import { useDialogFocus } from '../shared/useDialogFocus';
import './game-menu.css';

interface GameMenuProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  onLoad: () => void;
  onOpenApi: () => void;
  onRestart: () => void;
  onHome: () => void;
}

export function GameMenu({ onClose, onHome, onLoad, onOpenApi, onRestart, onSave, open }: GameMenuProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(open, dialogRef, onClose, undefined, {
    getFallbackFocus: () => document.querySelector<HTMLButtonElement>('.dock-actor-avatar, .ending-actions button')
  });
  if (!open) return null;
  return createPortal(
    <div className="game-menu-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={dialogRef} id="game-menu-panel" className="modal-card game-menu open" role="dialog" aria-modal="true" aria-labelledby="game-menu-title" tabIndex={-1}>
      <header className="game-menu-header">
        <h2 id="game-menu-title">调查菜单</h2>
        <button type="button" className="ghost-btn game-menu-close" aria-label="关闭调查菜单" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="game-menu-body">
      <section aria-labelledby="game-menu-records">
        <h3 id="game-menu-records">调查记录</h3>
        <div className="menu-list menu-records">
        <button onClick={onSave}><ArchiveRecordArt kind="file" />保存游戏</button>
        <button onClick={onLoad}><JournalArt />读取存档</button>
        </div>
      </section>
      <section aria-labelledby="game-menu-settings">
        <h3 id="game-menu-settings">设置</h3>
        <div className="menu-list">
        <button onClick={onOpenApi}><Settings size={16} />AI 设置</button>
        <AudioSettingsButton />
        </div>
      </section>
      <section aria-labelledby="game-menu-navigation">
        <h3 id="game-menu-navigation">导航</h3>
        <div className="menu-list">
        <button onClick={onRestart}><RotateCcw size={16} />重新开始</button>
        <button onClick={onHome}><Home size={16} />返回首页</button>
        </div>
      </section>
      </div>
      <footer><button type="button" className="primary-btn" onClick={onClose}>继续调查</button></footer>
    </aside>
    </div>, document.body);
}
