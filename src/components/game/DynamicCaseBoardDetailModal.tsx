import { X } from 'lucide-react';
import type { DynamicCaseBoardNode } from '../../types/game';

interface DynamicCaseBoardDetailModalProps {
  node: DynamicCaseBoardNode | null;
  onClose: () => void;
}

function sourceLines(node: DynamicCaseBoardNode): string[] {
  const lines: string[] = [];
  if (node.sourceClueIds.length) lines.push(`来源线索：${node.sourceClueIds.join('、')}`);
  if (node.sourceFactIds.length) lines.push(`来源事实：${node.sourceFactIds.join('、')}`);
  if (node.sourceEventIds.length) lines.push(`来源事件：${node.sourceEventIds.join('、')}`);
  return lines;
}

export function DynamicCaseBoardDetailModal({ node, onClose }: DynamicCaseBoardDetailModalProps) {
  if (!node) return null;
  const label = node.certainty === 'confirmed' ? '证实' : '推测';

  return (
    <div className="entity-detail-overlay" onClick={onClose}>
      <div
        aria-labelledby="dynamic-case-board-detail-title"
        className="entity-detail-card case-board-detail-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button className="entity-detail-close" onClick={onClose} type="button">
          <X size={18} />
        </button>
        <div className="entity-detail-header">
          <h3 id="dynamic-case-board-detail-title">{node.title}</h3>
          <span>{label}</span>
        </div>
        <div className="entity-detail-section">
          <h4>案件记录</h4>
          <div className={`entity-detail-known case-board-detail-note ${node.certainty}`}>
            <p>{node.detail || node.subtitle || '这条资料来自玩家已见事实，等待后续调查补强。'}</p>
          </div>
        </div>
        <div className="entity-detail-section">
          <h4>来源</h4>
          <div className="case-board-detail-sources">
            {sourceLines(node).map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p>创建回合：{node.createdTurn} · 更新回合：{node.updatedTurn}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
