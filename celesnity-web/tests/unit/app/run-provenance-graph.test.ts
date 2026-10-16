// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RunProvenanceGraph } from '@/app/(workspace)/chat/_components/run-provenance-graph';
import type { RunTraceSpan } from '@/src/entities/models/chat';

afterEach(() => {
  cleanup();
});

function span(overrides: Partial<RunTraceSpan> & Pick<RunTraceSpan, 'spanId'>): RunTraceSpan {
  return {
    traceId: 'trace-1',
    parentSpanId: null,
    runId: 'run-1',
    rootRunId: 'run-1',
    name: overrides.spanId,
    kind: 'tool',
    status: 'succeeded',
    startedAt: '2026-08-24T00:00:00.000Z',
    endedAt: '2026-08-24T00:00:01.000Z',
    attributes: {},
    error: null,
    ...overrides,
  };
}

describe('RunProvenanceGraph', () => {
  it('renders one node per span, labelled with its name', () => {
    const spans = [
      span({ spanId: 'root', name: 'trino_query' }),
      span({ spanId: 'child', parentSpanId: 'root', name: 'create_chart' }),
    ];

    const { container } = render(createElement(RunProvenanceGraph, { spans }));

    expect(container.textContent).toContain('trino_query');
    expect(container.textContent).toContain('create_chart');
    expect(container.querySelectorAll('rect')).toHaveLength(2);
  });

  it('draws one edge per parent-child relationship', () => {
    const spans = [span({ spanId: 'root' }), span({ spanId: 'child', parentSpanId: 'root' })];

    const { container } = render(createElement(RunProvenanceGraph, { spans }));

    expect(container.querySelectorAll('path')).toHaveLength(1);
  });

  it('renders no edges for a set of unrelated root spans', () => {
    const spans = [span({ spanId: 'a' }), span({ spanId: 'b' })];

    const { container } = render(createElement(RunProvenanceGraph, { spans }));

    expect(container.querySelectorAll('path')).toHaveLength(0);
    expect(container.querySelectorAll('rect')).toHaveLength(2);
  });

  it('renders an empty graph without throwing when there are no spans', () => {
    const { container } = render(createElement(RunProvenanceGraph, { spans: [] }));

    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });

  it('colors a succeeded span differently from a failed one', () => {
    // minder-runtime reports 'succeeded' | 'failed' | ... (never the literal
    // 'ok' this comparison used to check), so every span rendered with the
    // failed styling regardless of its real outcome.
    const spans = [
      span({ spanId: 'ok-span', status: 'succeeded' }),
      span({ spanId: 'failed-span', status: 'failed' }),
    ];

    const { container } = render(createElement(RunProvenanceGraph, { spans }));

    const [okRect, failedRect] = container.querySelectorAll('rect');
    expect(okRect?.getAttribute('class')).toContain('fill-accent');
    expect(failedRect?.getAttribute('class')).toContain('fill-destructive');
  });
});
