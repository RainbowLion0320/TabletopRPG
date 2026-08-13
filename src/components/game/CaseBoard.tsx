import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Search } from 'lucide-react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GameState } from '../../types/game';
import { CaseBoardInspector } from './CaseBoardInspector';
import { CaseBoardNodeCard, type CaseBoardFlowNodeData } from './CaseBoardNodeCard';
import {
  buildCaseBoardGraphModel,
  filterCaseBoardGraph,
  layoutCaseBoardGraph,
  type CaseBoardDisplayNode,
  type CaseBoardDisplayNodeType
} from './caseBoardGraph';

interface CaseBoardProps {
  state: GameState;
}

const NODE_TYPES = { caseBoardNode: CaseBoardNodeCard };

const EDGE_COLOR = {
  evidence: '#b99a61',
  suspicion: '#c97163',
  route: '#6f9db8',
  danger: '#d45f50'
};

const TYPE_OPTIONS: Array<{ value: 'all' | CaseBoardDisplayNodeType; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'npc', label: '人物' },
  { value: 'scene', label: '地点' },
  { value: 'item', label: '物证' },
  { value: 'event', label: '事件' },
  { value: 'theory', label: '推测' }
];

function neighborIds(selectedId: string | null, edges: ReturnType<typeof buildCaseBoardGraphModel>['edges']) {
  const ids = new Set<string>();
  if (!selectedId) return ids;
  ids.add(selectedId);
  edges.forEach((edge) => {
    if (edge.from === selectedId) ids.add(edge.to);
    if (edge.to === selectedId) ids.add(edge.from);
  });
  return ids;
}

export function CaseBoard({ state }: CaseBoardProps) {
  const model = useMemo(() => buildCaseBoardGraphModel(state), [state]);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | CaseBoardDisplayNodeType>('all');
  const [showHypotheses, setShowHypotheses] = useState(true);
  const [threadId, setThreadId] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layouted, setLayouted] = useState<Awaited<ReturnType<typeof layoutCaseBoardGraph>>>([]);
  const flowRef = useRef<ReactFlowInstance<Node<CaseBoardFlowNodeData>, Edge> | null>(null);
  const didInitialFit = useRef(false);
  const filtered = useMemo(() => filterCaseBoardGraph(model, {
    query, type, showHypotheses, threadId
  }), [model, query, showHypotheses, threadId, type]);

  useEffect(() => {
    let active = true;
    layoutCaseBoardGraph(filtered.nodes, filtered.edges).then((result) => {
      if (active) setLayouted(result);
    });
    return () => { active = false; };
  }, [filtered.edges, filtered.nodes]);

  useEffect(() => {
    if (!layouted.length || !flowRef.current || didInitialFit.current) return;
    didInitialFit.current = true;
    requestAnimationFrame(() => flowRef.current?.fitView({ padding: 0.18, duration: 280 }));
  }, [layouted]);

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

  const neighbors = neighborIds(selectedId, filtered.edges);
  const latestVisibleTurn = Math.max(0, ...model.nodes.map((node) => node.latestUpdateTurn));
  const flowNodes: Array<Node<CaseBoardFlowNodeData>> = layouted.map((node) => ({
    id: node.id,
    type: 'caseBoardNode',
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    draggable: false,
    selectable: true,
    data: {
      node,
      faded: Boolean(selectedId && !neighbors.has(node.id)),
      recent: Boolean(node.latestUpdateTurn && node.latestUpdateTurn === latestVisibleTurn)
    }
  }));
  const flowEdges: Edge[] = filtered.edges.map((edge) => {
    const faded = Boolean(selectedId && edge.from !== selectedId && edge.to !== selectedId);
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.label,
      type: 'smoothstep',
      className: `case-flow-edge ${edge.dynamic ? 'dynamic' : 'authored'} ${edge.tone} ${edge.certainty}${faded ? ' faded' : ''}`,
      markerEnd: edge.tone === 'route' ? { type: MarkerType.ArrowClosed, color: EDGE_COLOR.route } : undefined,
      style: {
        stroke: EDGE_COLOR[edge.tone],
        strokeWidth: selectedId && (edge.from === selectedId || edge.to === selectedId) ? 2.4 : 1.5,
        strokeDasharray: edge.certainty === 'hypothesis' || edge.tone === 'danger' ? '6 5' : undefined,
        opacity: faded ? 0.16 : 0.82
      },
      labelStyle: { fill: '#d8c7a4', fontSize: 11 },
      labelBgStyle: { fill: '#17130f', fillOpacity: 0.88 },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 3
    };
  });
  const selectedNode = model.nodes.find((node) => node.id === selectedId) ?? null;

  function selectNode(node: CaseBoardDisplayNode) {
    setSelectedId(node.id);
  }

  return (
    <section className="case-board-view" aria-labelledby="case-board-title">
      <div className="case-board-heading">
        <div>
          <h3 id="case-board-title">案件板</h3>
          <p>{model.summary}</p>
        </div>
        <span>{model.nodes.length} 项核心资料 · {model.edges.length} 条关系 · {model.insights.length} 条档案更新</span>
      </div>
      <div className="case-board-toolbar">
        <label className="case-board-search">
          <Search size={15} />
          <input aria-label="搜索案件资料" onChange={(event) => setQuery(event.target.value)} placeholder="搜索人物、地点或线索" value={query} />
        </label>
        <select aria-label="资料类型" onChange={(event) => setType(event.target.value as typeof type)} value={type}>
          {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button
          aria-pressed={showHypotheses}
          className={showHypotheses ? 'active' : ''}
          onClick={() => setShowHypotheses((value) => !value)}
          type="button"
        >
          {showHypotheses ? <Eye size={15} /> : <EyeOff size={15} />}
          显示推测
        </button>
      </div>

      {model.nodes.length ? (
        <div className={`case-board-workspace${selectedNode ? ' has-inspector' : ''}`}>
          <nav className="case-board-threads" aria-label="调查脉络">
            <h4>调查脉络</h4>
            <button aria-pressed={threadId === 'all'} onClick={() => setThreadId('all')} type="button">
              <strong>全部资料</strong><span>{model.nodes.length}</span>
            </button>
            {model.threads.map((thread) => (
              <button aria-pressed={threadId === thread.id} key={thread.id} onClick={() => setThreadId(thread.id)} type="button">
                <strong>{thread.title}</strong><span>{thread.nodeIds.length}</span>
              </button>
            ))}
          </nav>

          <div className="case-board-flow-wrap" aria-label="案件线索关系图">
            {flowNodes.length ? (
              <ReactFlow
                edges={flowEdges}
                fitView
                maxZoom={1.5}
                minZoom={0.35}
                nodeTypes={NODE_TYPES}
                nodes={flowNodes}
                nodesConnectable={false}
                nodesDraggable={false}
                onInit={(instance) => { flowRef.current = instance; }}
                onNodeClick={(_, node) => setSelectedId(node.id)}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="rgba(216,189,122,0.12)" gap={24} size={1} />
                <Controls position="bottom-right" showInteractive={false} />
              </ReactFlow>
            ) : <p className="empty-note">{filtered.nodes.length ? '正在整理关系图...' : '当前筛选条件下没有匹配资料。'}</p>}
          </div>

          <div className="case-board-mobile-list" aria-label="案件资料列表">
            {model.threads.map((thread) => {
              const threadNodes = filtered.nodes.filter((node) => thread.nodeIds.includes(node.id));
              if (!threadNodes.length) return null;
              return (
                <section key={thread.id}>
                  <h4>{thread.title}</h4>
                  {threadNodes.map((node) => {
                    const relations = filtered.edges.filter((edge) => edge.from === node.id || edge.to === node.id).slice(0, 2);
                    return (
                      <button className={`case-board-mobile-card ${node.type} ${node.certainty}`} key={node.id} onClick={() => selectNode(node)} type="button">
                        <span>{TYPE_OPTIONS.find((option) => option.value === node.type)?.label}</span>
                        <strong>{node.title}</strong>
                        {node.subtitle ? <small>{node.subtitle}</small> : null}
                        {relations.map((edge) => <small key={edge.id}>{edge.label ?? '存在关联'}</small>)}
                      </button>
                    );
                  })}
                </section>
              );
            })}
            {!filtered.nodes.length ? <p className="empty-note">当前筛选条件下没有匹配资料。</p> : null}
          </div>

          {selectedNode ? <CaseBoardInspector model={model} node={selectedNode} onClose={() => setSelectedId(null)} state={state} /> : null}
        </div>
      ) : <p className="empty-note">案件板还没有足够资料，先调查现场或询问 NPC。</p>}
    </section>
  );
}
