import ELK from 'elkjs/lib/elk-api.js';
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker';
import { CASE_BOARD_NODE_SIZE, type CaseBoardDisplayEdge, type CaseBoardDisplayNode, type LayoutedCaseBoardNode } from './caseBoardGraph';

type ElkEngine = InstanceType<typeof ELK>;
let elkPromise: Promise<ElkEngine> | null = null;
function getElk(): Promise<ElkEngine> {
  if (!elkPromise) elkPromise = import.meta.env.MODE === 'test'
    ? import('elkjs/lib/elk.bundled.js').then(({ default: BundledElk }) => new BundledElk())
    : Promise.resolve(new ELK({ workerFactory: () => new ElkWorker() }));
  return elkPromise;
}

/** Desktop-only graph layout; the phone archive never imports or starts ELK. */
export async function layoutNodes(nodes: CaseBoardDisplayNode[], edges: CaseBoardDisplayEdge[]): Promise<LayoutedCaseBoardNode[]> {
  const elk = await getElk();
  const layout = await elk.layout({
    id: 'case-board',
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '46', 'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.spacing.componentComponent': '72', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES'
    },
    children: nodes.map((node) => ({ id: node.id, ...CASE_BOARD_NODE_SIZE[node.type] })),
    edges: edges.map((edge) => ({ id: edge.id, sources: [edge.from], targets: [edge.to] }))
  });
  const positions = new Map((layout.children ?? []).map((child) => [child.id, child]));
  return nodes.map((node) => ({ ...node, x: positions.get(node.id)?.x ?? 0, y: positions.get(node.id)?.y ?? 0, ...CASE_BOARD_NODE_SIZE[node.type] }));
}
