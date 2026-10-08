import { useEffect, useRef, useState } from 'react';
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CaseBoardNodeCard, type CaseBoardFlowNodeData } from './CaseBoardNodeCard';
import { layoutCaseBoardGraph, type CaseBoardGraphModel } from './caseBoardGraph';

const NODE_TYPES = { caseBoardNode: CaseBoardNodeCard };
const EDGE_COLOR = { evidence: '#b99a61', suspicion: '#c97163', route: '#6f9db8', danger: '#d45f50' };
interface CaseBoardFlowProps { model: CaseBoardGraphModel; selectedId: string | null; onSelect: (id: string) => void }

export function CaseBoardFlow({ model, selectedId, onSelect }: CaseBoardFlowProps) {
  const [layouted, setLayouted] = useState<Awaited<ReturnType<typeof layoutCaseBoardGraph>>>([]);
  const [failed, setFailed] = useState(false);
  const flowRef = useRef<ReactFlowInstance<Node<CaseBoardFlowNodeData>, Edge> | null>(null);
  const didInitialFit = useRef(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    layoutCaseBoardGraph(model.nodes, model.edges).then((nodes) => {
      if (active) setLayouted(nodes);
    }).catch(() => { if (active) { setFailed(true); setLayouted([]); } });
    return () => { active = false; };
  }, [model.edges, model.nodes]);
  useEffect(() => {
    if (!layouted.length || !flowRef.current || didInitialFit.current) return;
    didInitialFit.current = true;
    requestAnimationFrame(() => flowRef.current?.fitView({ padding: .18, duration: 280 }));
  }, [layouted]);
  const neighbors = new Set<string>(selectedId ? [selectedId] : []);
  if (selectedId) model.edges.forEach((edge) => {
    if (edge.from === selectedId) neighbors.add(edge.to);
    if (edge.to === selectedId) neighbors.add(edge.from);
  });
  const latestVisibleTurn = Math.max(0, ...model.nodes.map((node) => node.latestUpdateTurn));
  const flowNodes: Array<Node<CaseBoardFlowNodeData>> = layouted.map((node) => ({
    id: node.id, type: 'caseBoardNode', position: { x: node.x, y: node.y }, width: node.width, height: node.height,
    draggable: false, selectable: true,
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
      labelStyle: { fill: '#d8c7a4', fontSize: 11 }, labelBgStyle: { fill: '#17130f', fillOpacity: .88 },
      labelBgPadding: [5, 3] as [number, number], labelBgBorderRadius: 3
    };
  });
  return <div className="case-board-flow-wrap" aria-label="案件线索关系图">
    {flowNodes.length ? <ReactFlow edges={flowEdges} nodes={flowNodes} nodeTypes={NODE_TYPES} fitView maxZoom={1.5} minZoom={.35}
      nodesConnectable={false} nodesDraggable={false} onInit={(instance) => { flowRef.current = instance; }} onNodeClick={(_, node) => onSelect(node.id)} proOptions={{ hideAttribution: true }}>
      <Background color="rgba(216,189,122,.12)" gap={24} size={1} /><Controls position="bottom-right" showInteractive={false} />
    </ReactFlow> : <p className="empty-note">{failed ? '暂时无法整理关系图，请重新打开资料。' : model.nodes.length ? '正在整理关系图...' : '当前筛选条件下没有匹配资料。'}</p>}
  </div>;
}
