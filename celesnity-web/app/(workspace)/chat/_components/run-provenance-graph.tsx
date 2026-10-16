import { cn } from '@/app/_components/ui/utils';
import type { RunTraceSpan } from '@/src/entities/models/chat';

import {
  layoutProvenance,
  PROVENANCE_NODE_HEIGHT,
  PROVENANCE_NODE_WIDTH,
} from './run-provenance-layout';

interface RunProvenanceGraphProps {
  readonly spans: readonly RunTraceSpan[];
}

const PADDING = 16;

/**
 * A directed graph of one run's steps — query, transformation, chart write —
 * for auditability (AIP Analyst's provenance/reasoning graph). Renders the
 * same trace data `TraceSpans` already lists as an indented list, as
 * connected boxes instead, so a reviewer can see the shape of a run at a
 * glance rather than reading an outline top to bottom.
 */
export function RunProvenanceGraph({ spans }: RunProvenanceGraphProps) {
  const layout = layoutProvenance(spans);
  const nodeBySpanId = new Map(layout.nodes.map((node) => [node.span.spanId, node]));

  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label="Run provenance graph"
        width={layout.width + PADDING * 2}
        height={layout.height + PADDING * 2}
        className="block"
      >
        <g transform={`translate(${PADDING}, ${PADDING})`}>
          {layout.edges.map((edge) => {
            const from = nodeBySpanId.get(edge.fromSpanId);
            const to = nodeBySpanId.get(edge.toSpanId);
            if (!from || !to) return null;
            const x1 = from.x + PROVENANCE_NODE_WIDTH / 2;
            const y1 = from.y + PROVENANCE_NODE_HEIGHT;
            const x2 = to.x + PROVENANCE_NODE_WIDTH / 2;
            const y2 = to.y;
            const midY = (y1 + y2) / 2;
            return (
              <path
                key={`${edge.fromSpanId}->${edge.toSpanId}`}
                d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                fill="none"
                className="stroke-border"
                strokeWidth={1.5}
              />
            );
          })}
          {layout.nodes.map(({ span, x, y }) => (
            <g key={span.spanId} transform={`translate(${x}, ${y})`}>
              <rect
                width={PROVENANCE_NODE_WIDTH}
                height={PROVENANCE_NODE_HEIGHT}
                rx={10}
                className={cn(
                  'stroke-1',
                  // Same two colors `TraceSpans` uses for this same data,
                  // one row up — `destructive` is this app's one status
                  // color (see CLAUDE.md), everything else rides the
                  // neutral palette. minder-runtime reports 'succeeded' |
                  // 'failed' | 'cancelled' | 'skipped' | 'running' (see
                  // minder-reliability's SpanStatus), never 'ok'.
                  span.status === 'succeeded'
                    ? 'fill-accent stroke-border'
                    : 'fill-destructive/10 stroke-destructive',
                )}
              />
              <text
                x={PROVENANCE_NODE_WIDTH / 2}
                y={17}
                textAnchor="middle"
                className="fill-muted-foreground text-micro font-semibold tracking-wide uppercase"
              >
                {span.kind}
              </text>
              <text
                x={PROVENANCE_NODE_WIDTH / 2}
                y={32}
                textAnchor="middle"
                className="fill-foreground text-caption font-medium"
              >
                {truncate(span.name, 20)}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
