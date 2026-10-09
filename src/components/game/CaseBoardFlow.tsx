import { useEffect, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { Background, getViewportForBounds, MarkerType, Panel, ReactFlow, useReactFlow, useStore, useViewport, type Edge, type Node, type Viewport } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CaseBoardNodeCard, type CaseBoardFlowNodeData } from './CaseBoardNodeCard';
import { layoutCaseBoardGraph, type CaseBoardGraphModel } from './caseBoardGraph';
import { ArchiveEmptyState } from '../shared/ArchiveEmptyState';
import './case-board-flow.css';

const NODE_TYPES = { caseBoardNode: CaseBoardNodeCard };
const EDGE_COLOR = { evidence: '#c4d9f1', suspicion: '#c799c7', route: '#8faad0', danger: '#de938b' };
const MIN_ZOOM = .2;
const MAX_ZOOM = 1.5;
interface CaseBoardFlowProps { model: CaseBoardGraphModel; selectedId: string | null; onSelect: (id: string) => void }

function motionDuration() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180; }

/** Layout supplies fixed card sizes; wait for the actual pane before moving it. */
function CaseBoardCamera({ geometryKey, focusKey, selectedId }: { geometryKey: string; focusKey: string; selectedId: string | null }) {
  const flow = useReactFlow<Node<CaseBoardFlowNodeData>, Edge>();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const pane = useStore((state) => state.domNode);
  const previous = useRef<{ geometryKey: string; selectedId: string | null } | null>(null);
  const savedView = useRef<Viewport | null>(null);
  useEffect(() => {
    if (!flow.viewportInitialized || !width || !height) return;
    const changedLayout = previous.current?.geometryKey !== geometryKey;
    if (changedLayout) savedView.current = null;
    if (selectedId && !previous.current?.selectedId && !changedLayout) savedView.current = flow.getViewport();
    previous.current = { geometryKey, selectedId };
    const frame = requestAnimationFrame(() => {
      if (pane && (pane.clientWidth !== width || pane.clientHeight !== height)) return;
      if (!selectedId && savedView.current) {
        const restored = savedView.current;
        savedView.current = null;
        void flow.setViewport(restored, { duration: motionDuration() });
        return;
      }
      let ids = JSON.parse(focusKey) as string[];
      const nodes = flow.getNodes();
      if (selectedId && ids.includes(selectedId)) {
        const nearby = nodes.filter((node) => ids.includes(node.id));
        const fitted = getViewportForBounds(flow.getNodesBounds(nearby), width, height, MIN_ZOOM, 1.25, .18);
        // A large neighborhood should not make the record being read illegible.
        if (fitted.zoom < .6) ids = [selectedId];
      }
      const targets = ids.length ? nodes.filter((node) => ids.includes(node.id)) : nodes;
      const viewport = getViewportForBounds(flow.getNodesBounds(targets), width, height, MIN_ZOOM, selectedId ? 1.25 : MAX_ZOOM, .18);
      void flow.setViewport(viewport, { duration: motionDuration() });
    });
    return () => cancelAnimationFrame(frame);
  }, [flow, focusKey, geometryKey, height, pane, selectedId, width]);
  return null;
}

function CaseBoardTools() {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return <Panel position="bottom-right" className="case-board-tools" role="group" aria-label="关系图视角">
    <button type="button" title="放大关系图" aria-label="放大关系图" disabled={zoom >= MAX_ZOOM - .001} onClick={() => { void flow.zoomIn({ duration: motionDuration() }); }}><Plus size={18} aria-hidden="true" /></button>
    <button type="button" title="缩小关系图" aria-label="缩小关系图" disabled={zoom <= MIN_ZOOM + .001} onClick={() => { void flow.zoomOut({ duration: motionDuration() }); }}><Minus size={18} aria-hidden="true" /></button>
    <button type="button" title="查看全部关系" aria-label="查看全部关系" onClick={() => { void flow.fitBounds(flow.getNodesBounds(flow.getNodes()), { padding: .18, duration: motionDuration() }); }}><Maximize size={18} aria-hidden="true" /></button>
  </Panel>;
}

export function CaseBoardFlow({ model, selectedId, onSelect }: CaseBoardFlowProps) {
  const [layouted, setLayouted] = useState<Awaited<ReturnType<typeof layoutCaseBoardGraph>>>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    layoutCaseBoardGraph(model.nodes, model.edges).then((nodes) => {
      if (active) setLayouted(nodes);
    }).catch(() => { if (active) { setFailed(true); setLayouted([]); } });
    return () => { active = false; };
  }, [model.edges, model.nodes]);
  const neighbors = new Set<string>(selectedId ? [selectedId] : []);
  if (selectedId) model.edges.forEach((edge) => {
    if (edge.from === selectedId) neighbors.add(edge.to);
    if (edge.to === selectedId) neighbors.add(edge.from);
  });
  const geometryKey = JSON.stringify(layouted.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })));
  const focusKey = JSON.stringify(layouted.filter((node) => neighbors.has(node.id)).map((node) => node.id).sort());
  const latestVisibleTurn = Math.max(0, ...model.nodes.map((node) => node.latestUpdateTurn));
  const flowNodes: Array<Node<CaseBoardFlowNodeData>> = layouted.map((node) => ({
    id: node.id, type: 'caseBoardNode', position: { x: node.x, y: node.y }, width: node.width, height: node.height,
    draggable: false, selectable: true, selected: node.id === selectedId,
    data: { node, faded: Boolean(selectedId && !neighbors.has(node.id)), recent: Boolean(node.latestUpdateTurn && node.latestUpdateTurn === latestVisibleTurn) }
  }));
  const flowEdges: Edge[] = model.edges.map((edge) => {
    const faded = Boolean(selectedId && edge.from !== selectedId && edge.to !== selectedId);
    return {
      id: edge.id, source: edge.from, target: edge.to, label: edge.label, type: 'smoothstep',
      className: `case-flow-edge ${edge.dynamic ? 'dynamic' : 'authored'} ${edge.tone} ${edge.certainty}${faded ? ' faded' : ''}`,
      markerEnd: edge.tone === 'route' ? { type: MarkerType.ArrowClosed, color: EDGE_COLOR.route } : undefined,
      style: { stroke: EDGE_COLOR[edge.tone], strokeWidth: selectedId && (edge.from === selectedId || edge.to === selectedId) ? 2.4 : 1.5,
        strokeDasharray: edge.certainty === 'hypothesis' || edge.tone === 'danger' ? '6 5' : undefined, opacity: faded ? .16 : .82 },
      labelStyle: { fill: 'var(--muted)', fontSize: 13 }, labelBgStyle: { fill: 'var(--panel-strong)', fillOpacity: .88 },
      labelBgPadding: [5, 3] as [number, number], labelBgBorderRadius: 3
    };
  });
  return <div className="case-board-flow-wrap" aria-label="案件线索关系图">
    {flowNodes.length ? <ReactFlow edges={flowEdges} nodes={flowNodes} nodeTypes={NODE_TYPES} maxZoom={MAX_ZOOM} minZoom={MIN_ZOOM}
      nodesConnectable={false} nodesDraggable={false} nodesFocusable={false} edgesFocusable={false} deleteKeyCode={null}
      onNodeClick={(event, node) => { event.currentTarget.querySelector<HTMLButtonElement>('.case-flow-node')?.focus({ preventScroll: true }); onSelect(node.id); }} proOptions={{ hideAttribution: true }}>
      <CaseBoardCamera geometryKey={geometryKey} focusKey={focusKey} selectedId={selectedId} />
      <Background color="rgba(196,217,241,.12)" gap={24} size={1} /><CaseBoardTools />
    </ReactFlow> : !failed && !model.nodes.length
      ? <ArchiveEmptyState className="case-board-empty">当前筛选条件下没有匹配资料。</ArchiveEmptyState>
      : <p className="empty-note">{failed ? '暂时无法整理关系图，请重新打开资料。' : '正在整理关系图...'}</p>}
  </div>;
}
