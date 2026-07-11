import { FileText, Lightbulb, MapPin, UserRound } from 'lucide-react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CaseBoardDisplayNode } from './caseBoardGraph';

export interface CaseBoardFlowNodeData extends Record<string, unknown> {
  node: CaseBoardDisplayNode;
  faded: boolean;
  recent: boolean;
}

function icon(type: CaseBoardDisplayNode['type']) {
  if (type === 'npc') return <UserRound size={15} />;
  if (type === 'scene') return <MapPin size={15} />;
  if (type === 'theory') return <Lightbulb size={15} />;
  return <FileText size={15} />;
}

const TYPE_LABEL: Record<CaseBoardDisplayNode['type'], string> = {
  npc: '人物',
  scene: '地点',
  item: '物证',
  event: '事件',
  theory: '推理'
};

export function CaseBoardNodeCard({ data, selected }: NodeProps) {
  const { node, faded, recent } = data as CaseBoardFlowNodeData;
  return (
    <article
      aria-label={`${TYPE_LABEL[node.type]} ${node.title}`}
      className={`case-flow-node ${node.type} ${node.certainty}${selected ? ' selected' : ''}${faded ? ' faded' : ''}${recent ? ' recent' : ''}`}
    >
      <Handle className="case-flow-handle" position={Position.Left} type="target" />
      {node.portrait ? <img src={node.portrait} alt="" /> : null}
      <div className="case-flow-node-body">
        <span className="case-flow-node-meta">{icon(node.type)}{TYPE_LABEL[node.type]}</span>
        <strong>{node.title}</strong>
        {node.subtitle ? <small>{node.subtitle}</small> : null}
        <div className="case-flow-node-foot">
          {node.certainty === 'hypothesis' ? <span>推测</span> : null}
          {node.insightCount ? <span>{node.insightCount} 条档案</span> : null}
        </div>
      </div>
      <Handle className="case-flow-handle" position={Position.Right} type="source" />
    </article>
  );
}
