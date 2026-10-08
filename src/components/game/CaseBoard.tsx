import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Search, X } from 'lucide-react';
import type { GameState } from '../../types/game';
import { CaseBoardInspector } from './CaseBoardInspector';
import { CaseBoardMobileCard } from './CaseBoardMobileCard';
import { useCaseBoardListLayout } from '../../platform/layout';
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

const DesktopBoard = lazy(() => import('./CaseBoardFlow').then((module) => ({ default: module.CaseBoardFlow })));

const TYPE_OPTIONS: Array<{ value: 'all' | CaseBoardDisplayNodeType; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'npc', label: '人物' },
  { value: 'scene', label: '地点' },
  { value: 'item', label: '物证' },
  { value: 'event', label: '事件' },
  { value: 'theory', label: '推测' }
];

export function CaseBoard({ state }: CaseBoardProps) {
  const archive = useCaseBoardListLayout();
  const model = useMemo(() => buildCaseBoardGraphModel(state), [state]);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<'all' | CaseBoardDisplayNodeType>('all');
  const [showHypotheses, setShowHypotheses] = useState(true);
  const [threadId, setThreadId] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = useMemo(() => filterCaseBoardGraph(model, {
    query, type, showHypotheses, threadId
  }), [model, query, showHypotheses, threadId, type]);

  useEffect(() => { if (archive) setThreadId('all'); }, [archive]);

  useEffect(() => {
    if (selectedId && !filtered.nodes.some((node) => node.id === selectedId)) setSelectedId(null);
  }, [filtered.nodes, selectedId]);

  useEffect(() => {
    if (threadId !== 'all' && !model.threads.some((thread) => thread.id === threadId)) setThreadId('all');
  }, [model.threads, threadId]);

  useEffect(() => {
    if (!selectedId) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedId(null);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [selectedId]);

  const selectedNode = model.nodes.find((node) => node.id === selectedId) ?? null;

  function selectNode(node: CaseBoardDisplayNode) {
    setSelectedId(node.id);
  }

  return (
    <section className={`case-board-view${archive ? ' archive-layout' : ''}`} aria-labelledby="case-board-title">
      <div className="case-board-heading">
        <div>
          <h3 id="case-board-title">案件板</h3>
          <p>{model.summary}</p>
        </div>
      </div>
      <div className="case-board-toolbar">
        <label className="case-board-search">
          <Search size={15} />
          <input ref={searchRef} type="search" aria-label="搜索案件资料" onChange={(event) => setQuery(event.target.value)} placeholder="搜索人物、地点或线索" value={query} />
          {query && <button type="button" className="case-search-clear" aria-label="清除案件搜索" onClick={() => { setQuery(''); searchRef.current?.focus(); }}><X size={16} /></button>}
        </label>
        <select aria-label="资料类型" onChange={(event) => setType(event.target.value as typeof type)} value={type}>
          {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {model.nodes.some((node) => node.certainty === 'hypothesis') && <button
          aria-label="显示推测"
          aria-pressed={showHypotheses}
          className={showHypotheses ? 'active' : ''}
          onClick={() => setShowHypotheses((value) => !value)}
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
            <button aria-pressed={threadId === 'all'} onClick={() => setThreadId('all')} type="button">
              <strong>全部资料</strong><span>{model.nodes.length}</span>
            </button>
            {model.threads.map((thread) => (
              <button aria-pressed={threadId === thread.id} key={thread.id} onClick={() => setThreadId(thread.id)} type="button">
                <strong>{thread.title}</strong><span>{thread.nodeIds.length}</span>
              </button>
            ))}
          </nav>}

          {!archive && <Suspense fallback={<div className="case-board-flow-wrap"><p className="empty-note">正在整理关系图...</p></div>}><DesktopBoard model={filtered} selectedId={selectedId} onSelect={setSelectedId} /></Suspense>}

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
            {!filtered.nodes.length ? <p className="empty-note">当前筛选条件下没有匹配资料。</p> : null}
          </div>}

          {selectedNode ? <CaseBoardInspector model={model} node={selectedNode} onClose={() => setSelectedId(null)} state={state} /> : null}
        </div>
      ) : <p className="empty-note">案件板还没有足够资料，先调查现场或询问 NPC。</p>}
    </section>
  );
}
