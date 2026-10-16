import {
  parseWorkflowGraph,
  triggerSnapshot,
} from '@application/data-workflow/workflow-graph-input';

function graph(config?: unknown): unknown {
  return {
    nodes: [
      { id: 'trigger', type: 'TRIGGER', ...(config === undefined ? {} : { config }) },
      { id: 'pipeline', type: 'PIPELINE', pipelineId: 'pipeline-1', versionNumber: 1 },
    ],
    edges: [
      {
        id: 'trigger-to-pipeline',
        sourceNodeId: 'trigger',
        sourcePortId: 'out',
        targetNodeId: 'pipeline',
        targetPortId: 'in',
      },
    ],
  };
}

describe('data workflow trigger input', () => {
  it('keeps a config-less trigger valid for a manual-only workflow', () => {
    const parsed = parseWorkflowGraph(graph());

    expect(parsed.nodes[0]).toEqual({ id: 'trigger', type: 'TRIGGER' });
    expect(triggerSnapshot(parsed)).toEqual({ triggerNodeId: 'trigger' });
  });

  it('preserves optional workflow authoring positions while accepting legacy graphs', () => {
    const input = graph() as {
      nodes: Array<Record<string, unknown>>;
      edges: readonly unknown[];
    };
    input.nodes[0] = { ...input.nodes[0], position: { x: 48, y: 160 } };
    input.nodes[1] = { ...input.nodes[1], position: { x: 320, y: 48 } };

    expect(parseWorkflowGraph(input).nodes.map((node) => node.position)).toEqual([
      { x: 48, y: 160 },
      { x: 320, y: 48 },
    ]);
    expect(parseWorkflowGraph(graph()).nodes.every((node) => node.position === undefined)).toBe(
      true,
    );
  });

  it('rejects malformed workflow authoring positions', () => {
    const input = graph() as {
      nodes: Array<Record<string, unknown>>;
      edges: readonly unknown[];
    };
    input.nodes[0] = { ...input.nodes[0], position: { x: 48 } };

    expect(() => parseWorkflowGraph(input)).toThrow();
  });

  it('pins calendar time, weekdays, and timezone in the publication snapshot', () => {
    const parsed = parseWorkflowGraph(
      graph({
        type: 'CALENDAR',
        timeOfDay: '07:00',
        weekdays: ['MON', 'WED'],
        timezone: 'Asia/Ho_Chi_Minh',
      }),
    );

    expect(triggerSnapshot(parsed)).toEqual({
      triggerNodeId: 'trigger',
      config: {
        type: 'CALENDAR',
        timeOfDay: '07:00',
        weekdays: ['MON', 'WED'],
        timezone: 'Asia/Ho_Chi_Minh',
      },
    });
  });

  it.each([
    { type: 'CALENDAR', timeOfDay: '7:00', weekdays: ['MON'], timezone: 'UTC' },
    { type: 'CALENDAR', timeOfDay: '24:00', weekdays: ['MON'], timezone: 'UTC' },
    { type: 'CALENDAR', timeOfDay: '07:60', weekdays: ['MON'], timezone: 'UTC' },
    { type: 'CALENDAR', timeOfDay: '07:00', weekdays: [], timezone: 'UTC' },
    { type: 'CALENDAR', timeOfDay: '07:00', weekdays: ['MON', 'MON'], timezone: 'UTC' },
    { type: 'CALENDAR', timeOfDay: '07:00', weekdays: ['WORKDAY'], timezone: 'UTC' },
    { type: 'CALENDAR', timeOfDay: '07:00', weekdays: ['MON'], timezone: 'Not/AZone' },
    { type: 'CALENDAR', expression: '0 7 * * *', timezone: 'UTC' },
    { type: 'CALENDAR', timeOfDay: '07:00', weekdays: ['MON'], timezone: 'UTC', untrusted: true },
  ])('rejects invalid or untrusted calendar trigger input: %j', (config) => {
    expect(() => parseWorkflowGraph(graph(config))).toThrow();
  });

  it('normalizes a valid interval anchor and rejects short or untrusted intervals', () => {
    const parsed = parseWorkflowGraph(
      graph({ type: 'INTERVAL', everySeconds: 10, anchorAt: '2026-09-18T07:00:00Z' }),
    );
    expect(parsed.nodes[0]).toEqual({
      id: 'trigger',
      type: 'TRIGGER',
      config: {
        type: 'INTERVAL',
        everySeconds: 10,
        anchorAt: '2026-09-18T07:00:00.000Z',
      },
    });

    expect(() =>
      parseWorkflowGraph(
        graph({ type: 'INTERVAL', everySeconds: 9, anchorAt: '2026-09-18T07:00:00Z' }),
      ),
    ).toThrow();
    expect(() =>
      parseWorkflowGraph(
        graph({
          type: 'INTERVAL',
          everySeconds: 10,
          anchorAt: '2026-09-18T07:00:00Z',
          untrusted: true,
        }),
      ),
    ).toThrow();
  });

  it('parses a strict polling Watch Source trigger with a cursor for every table', () => {
    const config = {
      type: 'WATCH_SOURCE',
      mode: 'POLLING',
      databaseServiceId: 'source-1',
      everySeconds: 600,
      relations: [
        {
          schema: 'public',
          table: 'orders',
          cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'id' },
        },
      ],
    };
    expect(triggerSnapshot(parseWorkflowGraph(graph(config)))).toEqual({
      triggerNodeId: 'trigger',
      config,
    });
    expect(() => parseWorkflowGraph(graph({ ...config, payload: { customer: 'row' } }))).toThrow();
    expect(() =>
      parseWorkflowGraph(
        graph({
          ...config,
          relations: [
            {
              schema: 'public',
              table: 'orders',
              cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'updated_at' },
            },
          ],
        }),
      ),
    ).toThrow();
    expect(() => parseWorkflowGraph(graph({ ...config, everySeconds: 9 }))).toThrow();
    expect(() => parseWorkflowGraph(graph({ ...config, changeTypes: ['INSERT'] }))).toThrow();
  });

  it('parses a strict CDC Watch Source trigger without a polling cursor', () => {
    const config = {
      type: 'WATCH_SOURCE',
      mode: 'CDC',
      databaseServiceId: 'source-1',
      aggregationWindowSeconds: 10,
      relations: [{ schema: 'public', table: 'orders' }],
      changeTypes: ['INSERT', 'UPDATE', 'DELETE'],
    };

    expect(triggerSnapshot(parseWorkflowGraph(graph(config)))).toEqual({
      triggerNodeId: 'trigger',
      config,
    });
    expect(() => parseWorkflowGraph(graph({ ...config, aggregationWindowSeconds: 0 }))).toThrow();
    expect(() => parseWorkflowGraph(graph({ ...config, aggregationWindowSeconds: 301 }))).toThrow();
    expect(() => parseWorkflowGraph(graph({ ...config, changeTypes: [] }))).toThrow();
    expect(() =>
      parseWorkflowGraph(
        graph({
          ...config,
          relations: [
            {
              schema: 'public',
              table: 'orders',
              cursor: { changeColumn: 'a', tieBreakerColumn: 'b' },
            },
          ],
        }),
      ),
    ).toThrow();
  });

  it('rejects an interval anchor whose date components do not form an instant', () => {
    expect(() =>
      parseWorkflowGraph(
        graph({ type: 'INTERVAL', everySeconds: 10, anchorAt: '2026-02-30T00:00:00Z' }),
      ),
    ).toThrow();
  });
});
