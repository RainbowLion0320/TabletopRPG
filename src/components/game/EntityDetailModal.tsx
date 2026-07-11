import { useEffect, useId, useRef } from 'react';
import { X, Lock } from 'lucide-react';
import type { EntityDetail } from '../../dm/entityDetail';

interface EntityDetailModalProps {
  detail: EntityDetail | null;
  onClose: () => void;
}

export function EntityDetailModal({ detail, onClose }: EntityDetailModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!detail) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [detail, onClose]);

  if (!detail) return null;

  return (
    <div className="entity-detail-overlay" onClick={onClose}>
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="entity-detail-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {/* 关闭按钮 */}
        <button
          aria-label="关闭详情"
          className="entity-detail-close"
          onClick={onClose}
          ref={closeRef}
          title="关闭"
          type="button"
        >
          <X size={18} />
        </button>

        {/* 立绘 */}
        {detail.portrait ? (
          <div className="entity-detail-portrait-wrap">
            <img className="entity-detail-portrait" src={detail.portrait} alt={detail.name} />
          </div>
        ) : null}

        {/* 名称 + 身份 */}
        <div className="entity-detail-header">
          <h3 id={titleId}>{detail.name}</h3>
          <span>{detail.role}</span>
        </div>

        {/* 已知信息 */}
        <div className="entity-detail-section">
          <h4>已知信息</h4>
          <div className="entity-detail-known">
            <p>{detail.baseInfo}</p>
          </div>
          {detail.knownSecrets.map((text, index) => (
            <div className="entity-detail-known entity-detail-secret" key={index}>
              <p>{text}</p>
            </div>
          ))}
        </div>

        {/* 未知信息 */}
        {detail.unknownCount > 0 ? (
          <div className="entity-detail-section">
            <h4>未知信息</h4>
            <div className="entity-detail-unknown">
              <Lock size={14} />
              <span>还有 {detail.unknownCount} 条信息待探索...</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
