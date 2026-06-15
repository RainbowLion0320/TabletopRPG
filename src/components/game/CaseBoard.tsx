import { FileText, Lightbulb, MapPin, UserRound } from 'lucide-react';
import { storyData } from '../../data/storyData';
import { caseBoard } from '../../data/scenarios/wuzhongxiaoshi';
import { getVisibleCaseBoard } from '../../dm/caseBoard';
import type { CaseBoardEdgeTone, CaseBoardNode, GameState } from '../../types/game';

interface CaseBoardProps {
  state: GameState;
  onNodeOpen: (node: CaseBoardNode) => void;
}

const TONE_LABEL: Record<CaseBoardEdgeTone, string> = {
  danger: '危险',
  evidence: '证据',
  route: '路线',
  suspicion: '嫌疑'
};

function nodeIcon(node: CaseBoardNode) {
  const size = 16;
  if (node.type === 'npc') return <UserRound size={size} />;
  if (node.type === 'scene') return <MapPin size={size} />;
  if (node.type === 'theory') return <Lightbulb size={size} />;
  return <FileText size={size} />;
}

function canOpenNode(node: CaseBoardNode): boolean {
  if (!node.refId) return false;
  return node.type === 'npc' || node.type === 'item';
}

function nodeMeta(node: CaseBoardNode): string {
  if (node.type === 'npc' && node.refId) return storyData.npcs[node.refId]?.role ?? '人物';
  if (node.type === 'item') return '物证';
  if (node.type === 'scene') return '地点';
  return '推理';
}

export function CaseBoard({ onNodeOpen, state }: CaseBoardProps) {
  const visible = getVisibleCaseBoard(caseBoard, state);
  const nodeById = new Map(visible.nodes.map((node) => [node.id, node]));
  const chapter = storyData.scenes[state.currentScene]?.chapterTitle ?? '当前章节';

  return (
    <section className="case-board-view" aria-labelledby="case-board-title">
      <div className="case-board-heading">
        <div>
          <p>{chapter}</p>
          <h3 id="case-board-title">案件板</h3>
        </div>
        <span>{visible.nodes.length} 条资料 · {visible.edges.length} 条关联</span>
      </div>
      <p className="case-board-summary">{caseBoard.summary}</p>

      {visible.nodes.length ? (
        <>
          <div className="case-board-canvas" aria-label="案件线索关系图">
            <svg className="case-board-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {visible.edges.map((edge) => {
                const from = nodeById.get(edge.from);
                const to = nodeById.get(edge.to);
                if (!from || !to) return null;
                return (
                  <line
                    key={edge.id}
                    className={`case-board-line ${edge.tone}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                  />
                );
              })}
            </svg>
            {visible.edges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to || !edge.label) return null;
              return (
                <span
                  key={`${edge.id}-label`}
                  className={`case-board-edge-label ${edge.tone}`}
                  style={{
                    left: `${(from.x + to.x) / 2}%`,
                    top: `${(from.y + to.y) / 2}%`
                  }}
                >
                  {edge.label}
                </span>
              );
            })}
            {visible.nodes.map((node) => {
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
                </>
              );
              const style = { left: `${node.x}%`, top: `${node.y}%` };
              return openable ? (
                <button
                  key={node.id}
                  className={`case-board-node ${node.type}`}
                  style={style}
                  type="button"
                  onClick={() => onNodeOpen(node)}
                >
                  {content}
                </button>
              ) : (
                <article key={node.id} className={`case-board-node ${node.type}`} style={style}>
                  {content}
                </article>
              );
            })}
          </div>
          <div className="case-board-compact-list" aria-label="案件资料列表">
            {visible.nodes.map((node) => (
              <button
                key={node.id}
                className={`case-board-compact-card ${node.type}`}
                disabled={!canOpenNode(node)}
                type="button"
                onClick={() => onNodeOpen(node)}
              >
                <span>{nodeMeta(node)}</span>
                <strong>{node.title}</strong>
                {node.subtitle ? <small>{node.subtitle}</small> : null}
              </button>
            ))}
            {visible.edges.map((edge) => (
              <div key={edge.id} className={`case-board-compact-edge ${edge.tone}`}>
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
