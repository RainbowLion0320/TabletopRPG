import { Component, lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import type { GameState } from '../../types/game';
import { CaseBoardInspector } from './CaseBoardInspector';
import { CaseBoardMobileCard } from './CaseBoardMobileCard';
import { useCaseBoardListLayout } from '../../platform/layout';
import { ArchiveEmptyState } from '../shared/ArchiveEmptyState';
import {
  buildCaseBoardGraphModel,
  type CaseBoardDisplayNode
} from './caseBoardGraph';
import './case-board-archive.css';

interface CaseBoardProps {
  state: GameState;
  readingState: MutableRefObject<CaseBoardReadingState | null>;
}

export interface CaseBoardReadingState {
  scrollTop: number;
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

export function CaseBoard({ state, readingState }: CaseBoardProps) {
  const [flowFailed, setFlowFailed] = useState(false);
  const archive = useCaseBoardListLayout() || import.meta.env.ANDROID_PUBLIC_NATIVE_BUNDLE || flowFailed;
  const model = useMemo(() => buildCaseBoardGraphModel(state), [state]);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const scrollPosition = useRef(readingState.current?.scrollTop ?? 0);
  const [selection, setSelection] = useState<string[]>([]);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const selectedId = selection[selection.length - 1] ?? null;
  // Keep the reading position while another reference page is mounted.
  // Closing the enclosing drawer releases this snapshot and all page content.
  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!archive || !workspace) return;
    workspace.scrollTop = scrollPosition.current;
    return () => {
      scrollPosition.current = workspace.scrollTop;
      readingState.current = { scrollTop: workspace.scrollTop };
    };
  }, [archive, readingState]);

  useEffect(() => {
    if (selection.some((id) => !model.nodes.some((node) => node.id === id))) {
      setSelection((current) => current.filter((id) => model.nodes.some((node) => node.id === id)));
    }
  }, [model.nodes, selection]);

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
      {model.nodes.length ? (
        <div className={`case-board-workspace${selectedNode ? ' has-inspector' : ''}`} ref={workspaceRef}
          onScroll={(event) => {
            if (!archive) return;
            scrollPosition.current = event.currentTarget.scrollTop;
            readingState.current = { scrollTop: scrollPosition.current };
          }}>
          {!archive && DesktopBoard && <GraphLoadBoundary onFailure={() => setFlowFailed(true)}><Suspense fallback={<div className="case-board-flow-wrap"><p className="empty-note">正在整理关系图...</p></div>}><DesktopBoard model={model} selectedId={selectedId} onSelect={(id) => { const node = model.nodes.find((item) => item.id === id); if (node) selectNode(node); }} /></Suspense></GraphLoadBoundary>}

          {archive && <div className="case-board-mobile-list" aria-label="案件资料列表">
            {model.threads.map((thread) => {
              const threadNodes = model.nodes.filter((node) => thread.nodeIds.includes(node.id));
              if (!threadNodes.length) return null;
              return (
                <section key={thread.id}>
                  {threadNodes.length > 1 && <h4>{thread.title}</h4>}
                  {threadNodes.map((node) => {
                    const relations = model.edges.filter((edge) => edge.from === node.id || edge.to === node.id).slice(0, 2);
                    return (
                      <CaseBoardMobileCard key={node.id} node={node} relations={relations} selected={selectedId === node.id} onSelect={() => selectNode(node)} />
                    );
                  })}
                </section>
              );
            })}
          </div>}

          {selectedNode ? <CaseBoardInspector model={model} node={selectedNode} onClose={() => setSelection([])} state={state} archive={archive}
            onSelect={followRelation} onBack={selection.length > 1 ? () => setSelection((current) => current.slice(0, -1)) : undefined} returnFocusRef={returnFocusRef} /> : null}
        </div>
      ) : <ArchiveEmptyState className="case-board-empty">案件板还没有足够资料，先调查现场或询问 NPC。</ArchiveEmptyState>}
    </section>
  );
}
