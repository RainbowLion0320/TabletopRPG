import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { storyData } from '../../data/storyData';
import { getClueDetail, getNpcDetail } from '../../dm/entityDetail';
import type { GameState } from '../../types/game';
import type { CaseBoardDisplayEdge, CaseBoardDisplayNode, CaseBoardGraphModel } from './caseBoardGraph';

interface CaseBoardInspectorProps {
  model: CaseBoardGraphModel;
  node: CaseBoardDisplayNode;
  state: GameState;
  onClose: () => void;
}

function nodeBaseInfo(node: CaseBoardDisplayNode, state: GameState) {
  if (node.dynamic) {
    return {
      role: node.certainty === 'confirmed' ? '已证实资料' : '待验证推测',
      description: node.dynamic.detail || node.subtitle || '来自玩家已见事实的案件记录。',
      secrets: [] as string[]
    };
  }
  if (node.type === 'npc' && node.refId) {
    const detail = getNpcDetail(node.refId, state);
    if (detail) return { role: detail.role, description: detail.baseInfo, secrets: detail.knownSecrets };
  }
  if (node.type === 'item' && node.refId) {
    const clue = state.clues.find((item) => item.id === node.refId) ?? storyData.items[node.refId];
    const detail = clue ? getClueDetail(clue, state) : null;
    if (detail) return { role: '物证', description: detail.baseInfo, secrets: detail.knownSecrets };
  }
  if (node.type === 'scene' && node.refId && node.refId in storyData.scenes) {
    const scene = storyData.scenes[node.refId as keyof typeof storyData.scenes];
    return { role: scene.chapterTitle, description: scene.desc, secrets: [] as string[] };
  }
  return { role: node.type === 'theory' ? '案件推理' : '案件记录', description: node.subtitle ?? node.title, secrets: [] as string[] };
}

function relationText(edge: CaseBoardDisplayEdge, node: CaseBoardDisplayNode, model: CaseBoardGraphModel) {
  const otherId = edge.from === node.id ? edge.to : edge.from;
  const other = model.nodes.find((candidate) => candidate.id === otherId);
  return `${edge.label ?? '存在关联'} · ${other?.title ?? '相关资料'}`;
}

function sourceLines(
  refs: { sourceFactIds: string[]; sourceEventIds: string[]; sourceClueIds: string[] },
  state: GameState
): string[] {
  const lines: string[] = [];
  refs.sourceClueIds.forEach((id) => {
    const clue = state.clues.find((item) => item.id === id) ?? storyData.items[id];
    if (clue) lines.push(`物证：${clue.name}`);
  });
  refs.sourceFactIds.forEach((id) => {
    const fact = state.atomicFacts?.find((item) => item.id === id);
    if (fact) lines.push(`第 ${fact.turn} 回合：${fact.actor}${fact.target ? `与${fact.target}` : ''}，${fact.value}`);
  });
  refs.sourceEventIds.forEach((id) => {
    const event = state.eventLog?.find((item) => item.id === id);
    if (event) lines.push(`第 ${event.turn} 回合：${event.description}`);
  });
  return [...new Set(lines)];
}

const INSIGHT_LABEL = {
  observation: '观察',
  testimony: '证词',
  motive: '动机',
  attitude: '态度',
  status: '状态'
} as const;

function useMobileInspector() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 900px)').matches
      : false
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 900px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}

export function CaseBoardInspector({ model, node, onClose, state }: CaseBoardInspectorProps) {
  const mobile = useMobileInspector();
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const base = nodeBaseInfo(node, state);
  const relations = model.edges.filter((edge) => edge.from === node.id || edge.to === node.id);
  const insights = model.insights
    .filter((insight) => insight.ownerNodeId === node.id)
    .sort((left, right) => right.updatedTurn - left.updatedTurn);
  const sources = [...new Set([
    ...(node.dynamic ? sourceLines(node.dynamic, state) : []),
    ...relations.flatMap((edge) => sourceLines(edge, state)),
    ...insights.flatMap((insight) => sourceLines(insight, state))
  ])];

  useEffect(() => {
    if (!mobile) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, [mobile]);

  return (
    <aside
      aria-label={`${node.title}详情`}
      aria-modal={mobile ? 'true' : undefined}
      className="case-board-inspector"
      role={mobile ? 'dialog' : undefined}
    >
      <header>
        <div>
          <span>{base.role}</span>
          <h4>{node.title}</h4>
        </div>
        <button aria-label="关闭资料详情" onClick={onClose} ref={closeRef} title="关闭" type="button"><X size={17} /></button>
      </header>
      <div className="case-board-inspector-scroll">
        <section>
          <h5>已知信息</h5>
          <p>{base.description}</p>
          {base.secrets.map((secret) => <p className="case-board-known-secret" key={secret}>{secret}</p>)}
        </section>
        {relations.length ? (
          <section>
            <h5>相关关系</h5>
            <ul>{relations.map((edge) => <li key={edge.id}>{relationText(edge, node, model)}</li>)}</ul>
          </section>
        ) : null}
        {insights.length ? (
          <section>
            <h5>实体档案</h5>
            <div className="case-board-insight-list">
              {insights.map((insight) => (
                <article className={insight.certainty} key={insight.id}>
                  <span>{INSIGHT_LABEL[insight.kind]} · 第 {insight.updatedTurn} 回合</span>
                  <p>{insight.text}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {sources.length ? (
          <section>
            <h5>信息来源</h5>
            <ul>{sources.map((source) => <li key={source}>{source}</li>)}</ul>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
