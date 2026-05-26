import { Play, Settings } from 'lucide-react';
import type { SaveSlot } from '../../types/game';

interface TitleScreenProps {
  hasSaves: boolean;
  onNewGame: () => void;
  onLoadLatest: () => void;
  onOpenApi: () => void;
  latestSave?: SaveSlot;
}

export function TitleScreen({ hasSaves, latestSave, onLoadLatest, onNewGame, onOpenApi }: TitleScreenProps) {
  return (
    <section className="title-screen">
      <div className="title-backdrop" />
      <div className="title-content">
        <p className="title-kicker">DISAPPEAR IN FOG · AI TRPG</p>
        <h1>雾中消逝</h1>
        <p className="title-subtitle">1920 年伦敦，煤气灯下的失踪案正在等待调查员。</p>
        <div className="title-actions">
          <button className="primary-btn" onClick={onNewGame}>
            <Play size={18} />
            开始游戏
          </button>
          <button className="ghost-btn" disabled={!hasSaves} onClick={onLoadLatest}>
            继续游戏
          </button>
          <button className="ghost-btn subtle" onClick={onOpenApi}>
            <Settings size={16} />
            AI 设置
          </button>
        </div>
        {latestSave ? (
          <p className="title-save-hint">最近存档：{latestSave.players} · {latestSave.savedAt}</p>
        ) : null}
      </div>
    </section>
  );
}
