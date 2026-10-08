import { ChevronRight, FileText, Lightbulb, Link2, MapPin, UserRound } from 'lucide-react';
import { storyData } from '../../data/storyData';
import type { CaseBoardDisplayEdge, CaseBoardDisplayNode } from './caseBoardGraph';

const TYPE_LABEL = { npc: '人物', scene: '地点', item: '物证', event: '事件', theory: '推测' } as const;
interface CardProps { node: CaseBoardDisplayNode; relations: CaseBoardDisplayEdge[]; selected: boolean; onSelect: () => void }

export function CaseBoardMobileCard({ node, relations, selected, onSelect }: CardProps) {
  const picture = node.portrait ?? (node.type === 'scene' ? Object.values(storyData.scenes).find((scene) => scene.id === node.refId)?.image : undefined);
  const Icon = node.type === 'npc' ? UserRound : node.type === 'scene' ? MapPin : node.type === 'theory' ? Lightbulb : FileText;
  const relationLabels = [...new Set(relations.map((edge) => edge.label).filter(Boolean))].join(' · ');
  return <button type="button" className={`case-board-mobile-card ${node.type} ${node.certainty}${selected ? ' selected' : ''}`}
    aria-label={`${TYPE_LABEL[node.type]} ${node.title}`} aria-haspopup="dialog" onClick={onSelect}>
    <span className="case-record-photo" aria-hidden="true"><Icon size={24} />{picture && <img src={picture} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
    <span className="case-record-body">
      <span className="case-record-meta">{TYPE_LABEL[node.type]}{node.certainty === 'hypothesis' && node.type !== 'theory' && <em>待验证</em>}</span>
      <strong>{node.title}</strong>
      {node.subtitle && node.subtitle !== TYPE_LABEL[node.type] && <small>{node.subtitle}</small>}
      {relationLabels && <small className="case-record-relation"><Link2 size={12} aria-hidden="true" />{relationLabels}</small>}
    </span>
    <ChevronRight className="case-record-arrow" size={16} aria-hidden="true" />
  </button>;
}
