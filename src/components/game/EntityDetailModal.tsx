import { useId, useRef } from 'react';
import { useDialogFocus } from '../shared/useDialogFocus';
import { useReadingMotion } from '../shared/useReadingMotion';
import { useOverlayPresence } from '../shared/useOverlayPresence';
import { useOverlayEntry } from '../shared/useOverlayEntry';
import { X } from 'lucide-react';
import type { EntityDetail } from '../../dm/entityDetail';
import { RecordDetailMedia } from './RecordDetailMedia';
import './record-detail.css';

interface EntityDetailModalProps {
  detail: EntityDetail | null;
  onClose: () => void;
}

export function EntityDetailModal({ detail: currentDetail, onClose }: EntityDetailModalProps) {
  const open = Boolean(currentDetail);
  const motion = useOverlayPresence(currentDetail);
  const detail = motion.value;
  const dialogRef = useRef<HTMLDivElement>(null);
  useOverlayEntry(motion.present, dialogRef);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDialogFocus(open, dialogRef, onClose);
  useReadingMotion(bodyRef, detail?.name ?? '', motion.present && Boolean(detail));

  if (!motion.present || !detail) return null;

  return (
    <div {...motion.layerProps} className="entity-detail-overlay" onClick={onClose}>
      <div
        aria-labelledby={titleId}
        aria-modal={open || undefined}
        className="entity-detail-card"
        onClick={(e) => e.stopPropagation()}
        role={open ? 'dialog' : undefined}
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

        <div className="entity-detail-body" ref={bodyRef} tabIndex={0} role="region" aria-label={`${detail.name}资料正文`}>
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
