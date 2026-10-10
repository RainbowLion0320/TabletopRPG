import { useLayoutEffect, useRef, type RefObject } from 'react';
import { ArrowLeft, ChevronRight, X } from 'lucide-react';
import { useDialogFocus } from '../shared/useDialogFocus';
import { useReadingMotion } from '../shared/useReadingMotion';
import { useCaseBoardListLayout, useShortViewport } from '../../platform/layout';
import { storyData } from '../../data/storyData';
import { getClueDetail, getNpcDetail } from '../../dm/entityDetail';
import type { GameState } from '../../types/game';
import type { CaseBoardDisplayEdge, CaseBoardDisplayNode, CaseBoardGraphModel } from './caseBoardGraph';
import { caseRecordImage, caseRecordText } from './caseBoardPresentation';
import { RecordDetailMedia } from './RecordDetailMedia';
import './record-detail.css';

interface CaseBoardInspectorProps {
  archive?: boolean;
  model: CaseBoardGraphModel;
  node: CaseBoardDisplayNode;
  state: GameState;
  onClose: () => void;
  onSelect: (id: string) => void;
  onBack?: () => void;
  returnFocusRef: RefObject<HTMLElement>;
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

function relatedNode(edge: CaseBoardDisplayEdge, node: CaseBoardDisplayNode, model: CaseBoardGraphModel) {
  const otherId = edge.from === node.id ? edge.to : edge.from;
  return model.nodes.find((candidate) => candidate.id === otherId);
}

function sourceLines(
  refs: { sourceFactIds: string[]; sourceEventIds: string[]; sourceClueIds: string[] },
  state: GameState
): string[] {
  const lines: string[] = [];
  refs.sourceClueIds.forEach((id) => {
    const clue = state.clues.find((item) => item.id === id) ?? storyData.items[id];
    if (clue) lines.push(`物证：${caseRecordText(clue.name, state.players)}`);
  });
  refs.sourceFactIds.forEach((id) => {
    const fact = state.atomicFacts?.find((item) => item.id === id);
    if (fact) {
      const actor = state.players.find(player => player.id === fact.actor)?.name ?? (fact.actor === 'world' ? '现场' : fact.actor);
      lines.push(`第 ${fact.turn} 回合：${actor}${fact.target ? `与${caseRecordText(fact.target, state.players)}` : ''}，${caseRecordText(fact.value, state.players)}`);
    }
  });
  refs.sourceEventIds.forEach((id) => {
    const event = state.eventLog?.find((item) => item.id === id);
    if (event) lines.push(`第 ${event.turn} 回合：${caseRecordText(event.description, state.players)}`);
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

export function CaseBoardInspector({ model, node, onClose, onSelect, onBack, returnFocusRef, state, archive = false }: CaseBoardInspectorProps) {
  const mobile = useCaseBoardListLayout() || archive;
  const shortViewport = useShortViewport();
  const modal = mobile || shortViewport;
  const dialogRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useReadingMotion(scrollRef, node.id);
  const sourcesRef = useRef<HTMLDetailsElement>(null);
  const recordReading = useRef(new Map<string, { scrollTop: number; sourcesOpen: boolean }>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousNode = useRef<string | null>(null);

  function rememberReading() {
    if (scrollRef.current) recordReading.current.set(node.id, {
      scrollTop: scrollRef.current.scrollTop, sourcesOpen: sourcesRef.current?.open ?? false
    });
  }
  function backToRecord() { rememberReading(); onBack?.(); }

  useDialogFocus(true, dialogRef, mobile && onBack ? backToRecord : onClose, returnFocusRef, { trapFocus: modal });
  useLayoutEffect(() => {
    const reading = recordReading.current.get(node.id);
    if (sourcesRef.current) sourcesRef.current.open = reading?.sourcesOpen ?? false;
    if (scrollRef.current) scrollRef.current.scrollTop = reading?.scrollTop ?? 0;
    if (previousNode.current && previousNode.current !== node.id) headingRef.current?.focus({ preventScroll: true });
    previousNode.current = node.id;
  }, [node.id]);
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

  return (
    <aside
      aria-label={`${node.title}详情`}
      aria-modal={modal ? 'true' : undefined}
      className={`case-board-inspector${modal ? ' modal' : ''}${!mobile && shortViewport ? ' case-details-short' : ''}`}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <header>
        {onBack && <button aria-label="返回上一份资料" className="record-detail-back" onClick={backToRecord} title="返回上一份资料" type="button"><ArrowLeft size={18} /></button>}
        <div className="record-detail-identity">
          <span>{base.role}</span>
          <h4 ref={headingRef} tabIndex={-1} title={node.title}>{node.title}</h4>
        </div>
        <button aria-label="关闭资料详情" onClick={onClose} title="关闭" type="button"><X size={17} /></button>
      </header>
      <div className="case-board-inspector-scroll" ref={scrollRef} onScroll={rememberReading}>
        <RecordDetailMedia src={caseRecordImage(node)} kind={node.type === 'scene' ? 'scene' : 'portrait'} name={node.title} />
        <section>
          <h5>已知信息</h5>
          <p>{caseRecordText(base.description, state.players)}</p>
          {base.secrets.map((secret) => <p className="case-board-known-secret" key={secret}>{caseRecordText(secret, state.players)}</p>)}
        </section>
        {relations.length ? (
          <section>
            <h5>相关关系</h5>
            <ul className="case-related-list">{relations.map((edge) => {
              const other = relatedNode(edge, node, model);
              if (!other) return null;
              return <li key={edge.id}><button className="case-related-record" type="button" aria-label={`查看${other.title}资料`} onClick={() => { rememberReading(); onSelect(other.id); }}>
                <span><small>{edge.label ?? '存在关联'}</small><strong>{other.title}</strong></span><ChevronRight size={17} aria-hidden="true" />
              </button></li>;
            })}</ul>
          </section>
        ) : null}
        {insights.length ? (
          <section>
            <h5>调查记录</h5>
            <div className="case-board-insight-list">
              {insights.map((insight) => (
                <article className={insight.certainty} key={insight.id}>
                  <span>{INSIGHT_LABEL[insight.kind]}{insight.certainty === 'hypothesis' ? ' · 待验证' : ''} · 第 {insight.updatedTurn} 回合</span>
                  <p>{insight.text}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {sources.length ? (
          <details className="case-record-sources" key={node.id} ref={sourcesRef} onToggle={rememberReading}>
            <summary><span>信息来源</span><ChevronRight size={17} aria-hidden="true" /></summary>
            <ul>{sources.map((source) => <li key={source}>{source}</li>)}</ul>
          </details>
        ) : null}
      </div>
    </aside>
  );
}
