import { X } from 'lucide-react';
import type { GameState } from '../../types/game';
import { storyData } from '../../data/storyData';

interface InfoDrawerProps {
  open: boolean;
  state: GameState;
  onClose: () => void;
  onOpen: () => void;
}

export function InfoDrawer({ onClose, onOpen, open, state }: InfoDrawerProps) {
  const npc = state.activeNpcName ? storyData.npcs[state.activeNpcName] : null;

  return (
    <>
      <button className="drawer-tab" onClick={onOpen}>
        <span>‹</span>
        资料
      </button>
      <aside className={`info-drawer-react ${open ? 'open' : ''}`}>
        <header>
          <div>
            <p>SESSION</p>
            <h2>资料</h2>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </header>

        <section className="drawer-section">
          <h3>当前 NPC</h3>
          {npc ? (
            <div className="npc-mini">
              <img src={npc.portrait} alt="" />
              <div>
                <strong>{state.activeNpcName}</strong>
                <span>{npc.role} · {npc.attitude}</span>
                <p>{npc.notes}</p>
              </div>
            </div>
          ) : <p className="empty-note">当前没有活跃 NPC。</p>}
        </section>

        <section className="drawer-section">
          <h3>已获线索</h3>
          {state.clues.length ? (
            <div className="clue-list">
              {state.clues.map((clue) => (
                <article key={clue.id}>
                  <strong>{clue.name}</strong>
                  <p>{clue.desc}</p>
                </article>
              ))}
            </div>
          ) : <p className="empty-note">尚未获取任何线索。</p>}
        </section>

        <section className="drawer-section">
          <h3>行动日志</h3>
          <div className="log-list-modern">
            {state.actionLog.map((log, index) => (
              <p key={`${log.time}-${index}`}><span>{log.time}</span>{log.text}</p>
            ))}
          </div>
        </section>
      </aside>
    </>
  );
}
