import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';

export interface CaseFlowEdgeData {
  label: string;
  faded: boolean;
  related: boolean;
  [key: string]: unknown;
}

export type CaseFlowEdgeType = Edge<CaseFlowEdgeData, 'caseFlowEdge'>;

/**
 * Relation captions have to leave the SVG layer: React Flow draws edges beneath
 * the node layer, so a caption rendered as SVG text is sliced wherever a card
 * overlaps it. EdgeLabelRenderer portals the caption into an HTML layer instead,
 * where it can sit above the cards, wrap to two lines and stay readable.
 */
export function CaseFlowEdge({
  id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, style, markerEnd, data
}: EdgeProps<CaseFlowEdgeType>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition
  });
  return <>
    <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
    {data?.label ? <EdgeLabelRenderer>
      <span
        className={`case-flow-edge-label${data.related ? ' related' : ''}${data.faded ? ' faded' : ''}`}
        style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
      >
        {data.label}
      </span>
    </EdgeLabelRenderer> : null}
  </>;
}
