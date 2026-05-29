import type { SaveSlot } from '../../types/game';

interface SaveManagerModalProps {
  open: boolean;
  saves: SaveSlot[];
  onClose: () => void;
  onDelete: (id: number) => void;
  onLoad: (save: SaveSlot) => void;
}

export function SaveManagerModal({ onClose, onDelete, onLoad, open, saves }: SaveManagerModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div aria-labelledby="save-manager-title" className="modal-card save-manager-card" role="dialog">
        <h2 id="save-manager-title">存档管理</h2>
        <p>选择一个存档载入，或删除不需要的本地存档。</p>

        {saves.length ? (
          <div className="save-list">
            {saves.map((save) => (
              <article className="save-slot-card" key={save.id}>
                <div>
                  <strong>{save.scene}</strong>
                  <span>{save.players}</span>
                  <small>{save.savedAt}</small>
                </div>
                <div className="save-slot-actions">
                  <button className="primary-btn compact" onClick={() => onLoad(save)}>载入存档</button>
                  <button className="ghost-btn compact danger" onClick={() => onDelete(save.id)}>删除存档</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-note">暂无存档</p>
        )}

        <footer>
          <button className="ghost-btn" onClick={onClose}>关闭</button>
        </footer>
      </div>
    </div>
  );
}
