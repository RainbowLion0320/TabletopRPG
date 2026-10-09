import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Eye, EyeOff, X } from 'lucide-react';
import type { GameState } from '../../types/game';
import { CaseBoardInspector } from './CaseBoardInspector';
import { CaseBoardMobileCard } from './CaseBoardMobileCard';
import { useCaseBoardListLayout } from '../../platform/layout';
import { ArchiveEmptyState } from '../shared/ArchiveEmptyState';
import { InvestigationEmblemArt } from '../shared/InvestigationEmblemArt';
import {
  buildCaseBoardGraphModel,
  filterCaseBoardGraph,
  type CaseBoardDisplayNode,
  type CaseBoardDisplayNodeType
} from './caseBoardGraph';
import './case-board-archive.css';

interface CaseBoardProps {
  state: GameState;
}

const DesktopBoard = import.meta.env.ANDROID_PUBLIC_NATIVE_BUNDLE ? null
  : lazy(() => import('./CaseBoardFlow').then((module) => ({ default: module.CaseBoardFlow })));

class GraphLoadBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) console.warn('[CaseBoard] using dossiers after graph failure:', error);
    this.props.onFailure();
  }
  render() { return this.state.failed ? null : this.props.children; }
}

const TYPE_OPTIONS: Array<{ value: 'all' | CaseBoardDisplayNodeType; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'npc', label: '人物' },
  { value: 'scene', label: '地点' },
  { value: 'item', label: '物证' },
  { value: 'event', label: '事件' },
  { value: 'theory', label: '推测' }
];

export function CaseBoard({ state }: CaseBoardProps) {
  const [flowFailed, setFlowFailed] = useState(false);
  const archive = useCaseBoardListLayout() || import.meta.env.ANDROID_PUBLIC_NATIVE_BUNDLE || flowFailed;
  const model = useMemo(() => buildCaseBoardGraphModel(state), [state]);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<'all' | CaseBoardDisplayNodeType>('all');
  const [showHypotheses, setShowHypotheses] = useState(true);
  const [threadId, setThreadId] = useState('all');
  const [selection, setSelection] = useState<string[]>([]);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const selectedId = selection[selection.length - 1] ?? null;
  const filtered = useMemo(() => filterCaseBoardGraph(model, {
    query, type, showHypotheses, threadId
  }), [model, query, showHypotheses, threadId, type]);

  useEffect(() => { if (archive) setThreadId('all'); }, [archive]);

  useEffect(() => {
    if (selection.some((id) => !model.nodes.some((node) => node.id === id))) {
      setSelection((current) => current.filter((id) => model.nodes.some((node) => node.id === id)));
    }
  }, [model.nodes, selection]);

  useEffect(() => {
    if (threadId !== 'all' && !model.threads.some((thread) => thread.id === threadId)) setThreadId('all');
  }, [model.threads, threadId]);

  const selectedNode = model.nodes.find((node) => node.id === selectedId) ?? null;

  function selectNode(node: CaseBoardDisplayNode) {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelection([node.id]);
  }

  function followRelation(id: string) {
    if (!model.nodes.some((node) => node.id === id)) return;
    setSelection((current) => {
      const index = current.indexOf(id);
      return index >= 0 ? current.slice(0, index + 1) : [...current, id];
    });
  }

  return (
    <section className={`case-board-view${archive ? ' archive-layout' : ''}`} aria-labelledby="case-board-title">
      <div className="case-board-heading">
        <div>
          <h3 id="case-board-title">案件板</h3>
          {!archive && <p>{model.summary}</p>}
        </div>
      </div>
      <div className="case-board-toolbar">
        <label className="case-board-search">
          <InvestigationEmblemArt size={16} />
          <input ref={searchRef} type="search" aria-label="搜索案件资料" onChange={(event) => { setSelection([]); setQuery(event.target.value); }} placeholder="搜索人物、地点或线索" value={query} />
          {query && <button type="button" className="case-search-clear" aria-label="清除案件搜索" onClick={() => { setSelection([]); setQuery(''); searchRef.current?.focus(); }}><X size={16} /></button>}
        </label>
        <label className="case-board-type">
          <select aria-label="资料类型" onChange={(event) => { setSelection([]); setType(event.target.value as typeof type); }} value={type}>
            {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
        {model.nodes.some((node) => node.certainty === 'hypothesis') && <button
          aria-label="显示推测"
          aria-pressed={showHypotheses}
          className={showHypotheses ? 'active' : ''}
          onClick={() => { setSelection([]); setShowHypotheses((value) => !value); }}
          type="button"
        >
          {showHypotheses ? <Eye size={15} /> : <EyeOff size={15} />}
          {showHypotheses ? '含推测' : '仅事实'}
        </button>}
      </div>

      {model.nodes.length ? (
        <div className={`case-board-workspace${selectedNode ? ' has-inspector' : ''}`}>
          {!archive && <nav className="case-board-threads" aria-label="调查脉络">
            <h4>调查脉络</h4>
            <button aria-pressed={threadId === 'all'} onClick={() => { setSelection([]); setThreadId('all'); }} type="button">
              <strong>全部资料</strong><span>{model.nodes.length}</span>
            </button>
            {model.threads.map((thread) => (
              <button aria-pressed={threadId === thread.id} key={thread.id} onClick={() => { setSelection([]); setThreadId(thread.id); }} type="button">
                <strong>{thread.title}</strong><span>{thread.nodeIds.length}</span>
              </button>
            ))}
          </nav>}

          {!archive && DesktopBoard && <GraphLoadBoundary onFailure={() => setFlowFailed(true)}><Suspense fallback={<div className="case-board-flow-wrap"><p className="empty-note">正在整理关系图...</p></div>}><DesktopBoard model={filtered} selectedId={selectedId} onSelect={(id) => { const node = model.nodes.find((item) => item.id === id); if (node) selectNode(node); }} /></Suspense></GraphLoadBoundary>}

          {archive && <div className="case-board-mobile-list" aria-label="案件资料列表">
            {model.threads.map((thread) => {
              const threadNodes = filtered.nodes.filter((node) => thread.nodeIds.includes(node.id));
              if (!threadNodes.length) return null;
              return (
                <section key={thread.id}>
                  {threadNodes.length > 1 && <h4>{thread.title}</h4>}
                  {threadNodes.map((node) => {
                    const relations = filtered.edges.filter((edge) => edge.from === node.id || edge.to === node.id).slice(0, 2);
                    return (
                      <CaseBoardMobileCard key={node.id} node={node} relations={relations} selected={selectedId === node.id} onSelect={() => selectNode(node)} />
                    );
                  })}
                </section>
              );
            })}
            {!filtered.nodes.length ? <ArchiveEmptyState className="case-board-empty">当前筛选条件下没有匹配资料。</ArchiveEmptyState> : null}
          </div>}

          {selectedNode ? <CaseBoardInspector model={model} node={selectedNode} onClose={() => setSelection([])} state={state} archive={archive}
            onSelect={followRelation} onBack={selection.length > 1 ? () => setSelection((current) => current.slice(0, -1)) : undefined} returnFocusRef={returnFocusRef} /> : null}
        </div>
      ) : <ArchiveEmptyState className="case-board-empty">案件板还没有足够资料，先调查现场或询问 NPC。</ArchiveEmptyState>}
    </section>
  );
}
