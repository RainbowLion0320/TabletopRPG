import { MapPin, UserRound } from 'lucide-react';
import { ArchiveRecordArt } from '../shared/ArchiveRecordArt';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CaseBoardDisplayNode } from './caseBoardGraph';
import { CASE_RECORD_LABEL, caseRecordImage } from './caseBoardPresentation';

export interface CaseBoardFlowNodeData extends Record<string, unknown> {
  node: CaseBoardDisplayNode;
  faded: boolean;
  recent: boolean;
}

function icon(type: CaseBoardDisplayNode['type']) {
  if (type === 'npc') return <UserRound size={16} aria-hidden="true" />;
  if (type === 'scene') return <MapPin size={16} aria-hidden="true" />;
  return <ArchiveRecordArt kind={type === 'theory' ? 'theory' : 'file'} />;
}

export function CaseBoardNodeCard({ data, selected }: NodeProps) {
  const { node, faded, recent } = data as CaseBoardFlowNodeData;
  const picture = caseRecordImage(node);
  return (
    <button
      type="button"
      aria-label={`${CASE_RECORD_LABEL[node.type]} ${node.title}`}
      aria-haspopup="dialog"
      className={`case-flow-node ${node.type} ${node.certainty}${selected ? ' selected' : ''}${faded ? ' faded' : ''}${recent ? ' recent' : ''}`}
    >
      <Handle className="case-flow-handle" position={Position.Left} type="target" isConnectable={false} aria-hidden="true" />
      {picture ? <span className="case-flow-photo" aria-hidden="true" key={picture}><img src={picture} alt="" loading="lazy" onError={(event) => { event.currentTarget.parentElement!.hidden = true; }} /></span> : null}
      <div className="case-flow-node-body">
        <span className="case-flow-node-meta">{icon(node.type)}{CASE_RECORD_LABEL[node.type]}</span>
        <strong>{node.title}</strong>
        {node.subtitle ? <small>{node.subtitle}</small> : null}
        <div className="case-flow-node-foot">
          {node.certainty === 'hypothesis' && node.type !== 'theory' ? <span>待验证</span> : null}
          {node.insightCount ? <span>调查记录</span> : null}
        </div>
      </div>
      <Handle className="case-flow-handle" position={Position.Right} type="source" isConnectable={false} aria-hidden="true" />
    </button>
  );
}
