import { describe, expect, it } from 'vitest';

import {
  layoutProvenance,
  PROVENANCE_NODE_HEIGHT,
  PROVENANCE_NODE_WIDTH,
} from '@/app/(workspace)/chat/_components/run-provenance-layout';
import type { RunTraceSpan } from '@/src/entities/models/chat';

function span(overrides: Partial<RunTraceSpan> & Pick<RunTraceSpan, 'spanId'>): RunTraceSpan {
  return {
    traceId: 'trace-1',
    parentSpanId: null,
    runId: 'run-1',
    rootRunId: 'run-1',
    name: overrides.spanId,
    kind: 'tool',
    status: 'ok',
    startedAt: '2026-08-24T00:00:00.000Z',
    endedAt: '2026-08-24T00:00:01.000Z',
    attributes: {},
    error: null,
    ...overrides,
  };
}

describe('layoutProvenance', () => {
  it('returns an empty layout for no spans', () => {
    expect(layoutProvenance([])).toEqual({ nodes: [], edges: [], width: 0, height: 0 });
  });

  it('places a root span alone on row 0', () => {
    const spans = [span({ spanId: 'root', startedAt: '2026-08-24T00:00:00.000Z' })];

    const layout = layoutProvenance(spans);

    expect(layout.nodes).toEqual([{ span: spans[0], x: 0, y: 0 }]);
    expect(layout.edges).toEqual([]);
    expect(layout.width).toBe(PROVENANCE_NODE_WIDTH);
    expect(layout.height).toBe(PROVENANCE_NODE_HEIGHT);
  });

  it('places a child one row below its parent, connected by an edge', () => {
    const spans = [
      span({ spanId: 'root', startedAt: '2026-08-24T00:00:00.000Z' }),
      span({ spanId: 'child', parentSpanId: 'root', startedAt: '2026-08-24T00:00:01.000Z' }),
    ];

    const layout = layoutProvenance(spans);

    const root = layout.nodes.find((node) => node.span.spanId === 'root');
    const child = layout.nodes.find((node) => node.span.spanId === 'child');
    expect(root?.y).toBe(0);
    expect(child?.y).toBeGreaterThan(root?.y ?? 0);
    expect(layout.edges).toEqual([{ fromSpanId: 'root', toSpanId: 'child' }]);
  });

  it('orders siblings on the same row by start time', () => {
    const spans = [
      span({ spanId: 'root', startedAt: '2026-08-24T00:00:00.000Z' }),
      span({ spanId: 'second', parentSpanId: 'root', startedAt: '2026-08-24T00:00:02.000Z' }),
      span({ spanId: 'first', parentSpanId: 'root', startedAt: '2026-08-24T00:00:01.000Z' }),
    ];

    const layout = layoutProvenance(spans);

    const first = layout.nodes.find((node) => node.span.spanId === 'first');
    const second = layout.nodes.find((node) => node.span.spanId === 'second');
    expect(first?.x).toBeLessThan(second?.x ?? 0);
  });

  it('omits an edge whose parent span is not in the set (a pruned/missing ancestor)', () => {
    const spans = [span({ spanId: 'orphan', parentSpanId: 'missing-parent' })];

    const layout = layoutProvenance(spans);

    expect(layout.edges).toEqual([]);
    // Falls back to depth 0 since the parent can't be found to walk further.
    expect(layout.nodes[0]?.y).toBe(0);
  });
});
