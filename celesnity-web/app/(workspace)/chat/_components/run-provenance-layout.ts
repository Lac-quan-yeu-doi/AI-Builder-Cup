import type { RunTraceSpan } from '@/src/entities/models/chat';

export const PROVENANCE_NODE_WIDTH = 160;
export const PROVENANCE_NODE_HEIGHT = 44;
const GAP_X = 24;
const GAP_Y = 56;

export interface ProvenanceNode {
  readonly span: RunTraceSpan;
  readonly x: number;
  readonly y: number;
}

export interface ProvenanceEdge {
  readonly fromSpanId: string;
  readonly toSpanId: string;
}

export interface ProvenanceLayout {
  readonly nodes: readonly ProvenanceNode[];
  readonly edges: readonly ProvenanceEdge[];
  readonly width: number;
  readonly height: number;
}

/** How many ancestor hops separate a span from its trace's root span. */
function depthOf(span: RunTraceSpan, spans: readonly RunTraceSpan[]): number {
  let depth = 0;
  let parentId = span.parentSpanId;
  while (parentId) {
    const parent = spans.find((candidate) => candidate.spanId === parentId);
    if (!parent) break;
    depth += 1;
    parentId = parent.parentSpanId;
  }
  return depth;
}

/**
 * Positions each span as one row per ancestor depth (query → transformation
 * → chart reads top to bottom), ordered left to right by start time within
 * a row — a dependency-free stand-in for a real graph-layout library, sized
 * for the shallow, mostly-linear traces a single run actually produces.
 */
export function layoutProvenance(spans: readonly RunTraceSpan[]): ProvenanceLayout {
  const ordered = [...spans].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const rows = new Map<number, RunTraceSpan[]>();
  for (const span of ordered) {
    const depth = depthOf(span, spans);
    const row = rows.get(depth);
    if (row) row.push(span);
    else rows.set(depth, [span]);
  }

  const nodes: ProvenanceNode[] = [];
  let maxRowWidth = 0;
  for (const [depth, rowSpans] of rows) {
    rowSpans.forEach((span, index) => {
      nodes.push({
        span,
        x: index * (PROVENANCE_NODE_WIDTH + GAP_X),
        y: depth * (PROVENANCE_NODE_HEIGHT + GAP_Y),
      });
    });
    maxRowWidth = Math.max(maxRowWidth, rowSpans.length * (PROVENANCE_NODE_WIDTH + GAP_X) - GAP_X);
  }

  const edges: ProvenanceEdge[] = [];
  for (const span of spans) {
    if (span.parentSpanId && spans.some((candidate) => candidate.spanId === span.parentSpanId)) {
      edges.push({ fromSpanId: span.parentSpanId, toSpanId: span.spanId });
    }
  }

  const rowCount = rows.size;
  return {
    nodes,
    edges,
    width: rowCount === 0 ? 0 : Math.max(maxRowWidth, PROVENANCE_NODE_WIDTH),
    height: rowCount === 0 ? 0 : rowCount * (PROVENANCE_NODE_HEIGHT + GAP_Y) - GAP_Y,
  };
}
