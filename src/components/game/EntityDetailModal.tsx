import { useId, useRef } from 'react';
import { useDialogFocus } from '../shared/useDialogFocus';
import { useReadingMotion } from '../shared/useReadingMotion';
import { X } from 'lucide-react';
import type { EntityDetail } from '../../dm/entityDetail';
import { RecordDetailMedia } from './RecordDetailMedia';
import './record-detail.css';

interface EntityDetailModalProps {
  detail: EntityDetail | null;
  onClose: () => void;
}

export function EntityDetailModal({ detail, onClose }: EntityDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDialogFocus(Boolean(detail), dialogRef, onClose);
  useReadingMotion(bodyRef, detail?.name ?? '', Boolean(detail));

  if (!detail) return null;

  return (
    <div className="entity-detail-overlay" onClick={onClose}>
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="entity-detail-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="entity-detail-header">
          <div className="record-detail-identity">
            <span>{detail.role}</span>
            <h3 id={titleId} title={detail.name}>{detail.name}</h3>
          </div>
          <button
            aria-label="关闭详情"
            className="entity-detail-close"
            onClick={onClose}
            title="关闭"
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="entity-detail-body" ref={bodyRef}>
          <RecordDetailMedia src={detail.image ?? detail.portrait} kind={detail.image ? 'scene' : 'portrait'} name={detail.name} />
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
        </div>
      </div>
    </div>
  );
}
