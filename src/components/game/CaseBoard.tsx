import { FileText, Lightbulb, MapPin, UserRound } from 'lucide-react';
import { storyData } from '../../data/storyData';
import { caseBoard } from '../../data/scenarios/wuzhongxiaoshi';
import { getVisibleCaseBoard } from '../../dm/caseBoard';
import type {
  CaseBoardCertainty,
  CaseBoardEdgeTone,
  CaseBoardNode,
  CaseBoardSource,
  DynamicCaseBoardNode,
  GameState
} from '../../types/game';

interface CaseBoardProps {
  state: GameState;
  onNodeOpen: (node: CaseBoardNode) => void;
  onDynamicNodeOpen: (node: DynamicCaseBoardNode) => void;
}

type DisplayNodeType = CaseBoardNode['type'] | 'event';

interface DisplayNode {
  id: string;
  type: DisplayNodeType;
  refId?: string;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  source: CaseBoardSource;
  certainty: CaseBoardCertainty;
  dynamic?: DynamicCaseBoardNode;
}

interface DisplayEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  tone: CaseBoardEdgeTone;
  source: CaseBoardSource;
  certainty: CaseBoardCertainty;
}

const TONE_LABEL: Record<CaseBoardEdgeTone, string> = {
  danger: '危险',
  evidence: '证据',
  route: '路线',
  suspicion: '嫌疑'
};

function nodeIcon(node: Pick<DisplayNode, 'type'>) {
  const size = 16;
  if (node.type === 'npc') return <UserRound size={size} />;
  if (node.type === 'scene') return <MapPin size={size} />;
  if (node.type === 'theory') return <Lightbulb size={size} />;
  return <FileText size={size} />;
}

function canOpenNode(node: DisplayNode): boolean {
  if (node.dynamic) return true;
  if (!node.refId) return false;
  return node.type === 'npc' || node.type === 'item';
}

function nodeMeta(node: Pick<DisplayNode, 'refId' | 'type'>): string {
  if (node.type === 'npc' && node.refId) return storyData.npcs[node.refId]?.role ?? '人物';
  if (node.type === 'item') return '物证';
  if (node.type === 'scene') return '地点';
  if (node.type === 'event') return '事件';
  return '推理';
}

function layoutDynamicNodes(nodes: DynamicCaseBoardNode[]): DisplayNode[] {
  const rowByType = new Map<DisplayNodeType, number>();
  const xByType: Record<DisplayNodeType, number> = {
    npc: 58,
    item: 72,
    scene: 86,
    theory: 64,
    event: 80
  };

  return nodes.map((node, index) => {
    const row = rowByType.get(node.type) ?? 0;
    rowByType.set(node.type, row + 1);
    const stagger = index % 2 === 0 ? 0 : 4;
    return {
      id: node.id,
      type: node.type,
      title: node.title,
      subtitle: node.subtitle,
      x: Math.min(90, xByType[node.type] + Math.floor(row / 4) * 5),
      y: Math.min(88, 18 + (row % 5) * 15 + stagger),
      source: node.source,
      certainty: node.certainty,
      dynamic: node
    };
  });
}

function toStaticDisplayNode(node: CaseBoardNode): DisplayNode {
  return {
    id: node.id,
    type: node.type,
    refId: node.refId,
    title: node.title,
    subtitle: node.subtitle,
    x: node.x,
    y: node.y,
    source: 'scenario',
    certainty: 'confirmed'
  };
}

export function CaseBoard({ onDynamicNodeOpen, onNodeOpen, state }: CaseBoardProps) {
  const visible = getVisibleCaseBoard(caseBoard, state);
  const dynamicNodes = (state.caseBoard?.nodes ?? []).filter((node) => node.status === 'active');
  const nodes = [
    ...visible.nodes.map(toStaticDisplayNode),
    ...layoutDynamicNodes(dynamicNodes)
  ];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: DisplayEdge[] = [
    ...visible.edges.map((edge) => ({ ...edge, source: 'scenario' as const, certainty: 'confirmed' as const })),
    ...(state.caseBoard?.edges ?? [])
      .filter((edge) => edge.status === 'active' && nodeById.has(edge.from) && nodeById.has(edge.to))
      .map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.label,
        tone: edge.tone,
        source: edge.source,
        certainty: edge.certainty
      }))
  ];
  const chapter = storyData.scenes[state.currentScene]?.chapterTitle ?? '当前章节';

  function openNode(node: DisplayNode) {
    if (node.dynamic) {
      onDynamicNodeOpen(node.dynamic);
      return;
    }
    const staticNode = visible.nodes.find((candidate) => candidate.id === node.id);
    if (staticNode) onNodeOpen(staticNode);
  }

  return (
    <section className="case-board-view" aria-labelledby="case-board-title">
      <div className="case-board-heading">
        <div>
          <p>{chapter}</p>
          <h3 id="case-board-title">案件板</h3>
        </div>
        <span>{nodes.length} 条资料 · {edges.length} 条关联</span>
      </div>
      <p className="case-board-summary">{caseBoard.summary}</p>

      {nodes.length ? (
        <>
          <div className="case-board-canvas" aria-label="案件线索关系图">
            <svg className="case-board-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {edges.map((edge) => {
                const from = nodeById.get(edge.from);
                const to = nodeById.get(edge.to);
                if (!from || !to) return null;
                return (
                  <line
                    key={edge.id}
                    className={`case-board-line ${edge.tone} ${edge.certainty}${edge.source === 'ai' ? ' dynamic' : ''}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                  />
                );
              })}
            </svg>
            {edges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to || !edge.label) return null;
              return (
                <span
                  key={`${edge.id}-label`}
                  className={`case-board-edge-label ${edge.tone} ${edge.certainty}${edge.source === 'ai' ? ' dynamic' : ''}`}
                  style={{
                    left: `${(from.x + to.x) / 2}%`,
                    top: `${(from.y + to.y) / 2}%`
                  }}
                >
                  {edge.label}
                </span>
              );
            })}
            {nodes.map((node) => {
              const openable = canOpenNode(node);
              const content = (
                <>
                  <span className="case-board-pin" />
                  <span className="case-board-node-meta">
                    {nodeIcon(node)}
                    {nodeMeta(node)}
                  </span>
                  <strong>{node.title}</strong>
                  {node.subtitle ? <small>{node.subtitle}</small> : null}
                  {node.dynamic ? (
                    <span className={`case-board-certainty ${node.certainty}`}>
                      {node.certainty === 'confirmed' ? '证实' : '推测'}
                    </span>
                  ) : null}
                </>
              );
              const style = { left: `${node.x}%`, top: `${node.y}%` };
              const className = `case-board-node ${node.type} ${node.certainty}${node.dynamic ? ' dynamic' : ''}`;
              return openable ? (
                <button
                  key={node.id}
                  className={className}
                  style={style}
                  type="button"
                  onClick={() => openNode(node)}
                >
                  {content}
                </button>
              ) : (
                <article key={node.id} className={className} style={style}>
                  {content}
                </article>
              );
            })}
          </div>
          <div className="case-board-compact-list" aria-label="案件资料列表">
            {nodes.map((node) => (
              <button
                key={node.id}
                className={`case-board-compact-card ${node.type} ${node.certainty}${node.dynamic ? ' dynamic' : ''}`}
                disabled={!canOpenNode(node)}
                type="button"
                onClick={() => openNode(node)}
              >
                <span>{nodeMeta(node)}</span>
                <strong>{node.title}</strong>
                {node.subtitle ? <small>{node.subtitle}</small> : null}
                {node.dynamic ? <small>{node.certainty === 'confirmed' ? '证实' : '推测'}</small> : null}
              </button>
            ))}
            {edges.map((edge) => (
              <div key={edge.id} className={`case-board-compact-edge ${edge.tone} ${edge.certainty}`}>
                <span>{TONE_LABEL[edge.tone]}</span>
                <strong>{nodeById.get(edge.from)?.title} → {nodeById.get(edge.to)?.title}</strong>
                {edge.label ? <small>{edge.label}</small> : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="empty-note">案件板还没有足够资料，先调查现场或询问 NPC。</p>
      )}
    </section>
  );
}
