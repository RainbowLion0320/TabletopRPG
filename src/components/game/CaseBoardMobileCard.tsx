import { ChevronRight, Link2, MapPin, UserRound } from 'lucide-react';
import { ArchiveRecordArt } from '../shared/ArchiveRecordArt';
import { CASE_RECORD_LABEL, caseRecordImage } from './caseBoardPresentation';
import type { CaseBoardDisplayEdge, CaseBoardDisplayNode } from './caseBoardGraph';

interface CardProps { node: CaseBoardDisplayNode; relations: CaseBoardDisplayEdge[]; selected: boolean; onSelect: () => void }

export function CaseBoardMobileCard({ node, relations, selected, onSelect }: CardProps) {
  const picture = caseRecordImage(node);
  const Icon = node.type === 'npc' ? UserRound : node.type === 'scene' ? MapPin : null;
  const relationLabels = [...new Set(relations.map((edge) => edge.label).filter(Boolean))].join(' · ');
  return <button type="button" className={`case-board-mobile-card ${node.type} ${node.certainty}${selected ? ' selected' : ''}`}
    aria-label={`${CASE_RECORD_LABEL[node.type]} ${node.title}`} aria-haspopup="dialog" onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); onSelect(); }}>
    <span className="case-record-photo" aria-hidden="true">{Icon ? <Icon size={24} /> : <ArchiveRecordArt kind={node.type === 'theory' ? 'theory' : 'file'} />}{picture && <img src={picture} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
    <span className="case-record-body">
      <span className="case-record-meta">{CASE_RECORD_LABEL[node.type]}{node.certainty === 'hypothesis' && node.type !== 'theory' && <em>待验证</em>}</span>
      <strong>{node.title}</strong>
      {node.subtitle && node.subtitle !== CASE_RECORD_LABEL[node.type] && <small>{node.subtitle}</small>}
      {relationLabels && <small className="case-record-relation"><Link2 size={14} aria-hidden="true" />{relationLabels}</small>}
    </span>
    <ChevronRight className="case-record-arrow" size={16} aria-hidden="true" />
  </button>;
}
