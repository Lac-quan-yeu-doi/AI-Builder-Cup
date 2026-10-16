import { describe, expect, it } from 'vitest';

import { publishIssues } from '@/src/entities/models/plant-model';
import {
  PROPERTY,
  walkthroughObservationSchema,
  walkthroughToTwin as toPlantModel,
  type WalkthroughObservation,
} from '@/src/entities/models/plant-walkthrough';
import { SAMPLE_OBSERVATION } from './fixtures/plant-walkthrough-harbor-linen';

const node = (twin: ReturnType<typeof toPlantModel>, id: string) =>
  twin.draft.nodes.find((value) => value.id === id) ?? fail(id);
const fail = (id: string): never => {
  throw new Error(`no node ${id}`);
};

describe('toPlantModel', () => {
  it('accepts the sample as a schema-valid observation', () => {
    expect(walkthroughObservationSchema.safeParse(SAMPLE_OBSERVATION).success).toBe(true);
  });

  it('builds a draft that passes the Minder validator with no warnings', () => {
    const twin = toPlantModel(SAMPLE_OBSERVATION);
    expect(twin.warnings).toEqual([]);
    expect(twin.draft.nodes).toHaveLength(2 + 2 + 10);
    expect(publishIssues(twin.draft)).toEqual([]);
  });

  it('nests equipment under its line, and its area when it has no line', () => {
    const twin = toPlantModel(SAMPLE_OBSERVATION);
    const parent = (id: string) =>
      twin.draft.relationships.find(
        (value) => value.kind === 'contains' && value.targetNodeId === id,
      )?.sourceNodeId;
    expect(parent('washer-1')).toBe('wash-line');
    expect(parent('wash-line')).toBe('wet-hall');
    expect(parent('sorting')).toBe('wet-hall');
    expect(parent('boiler')).toBeUndefined();
  });

  it('derives routing roles from the flows', () => {
    const twin = toPlantModel(SAMPLE_OBSERVATION);
    expect(node(twin, 'sorting').routingRole).toBe('source');
    expect(node(twin, 'dryer-1').routingRole).toBe('intermediate');
    expect(node(twin, 'qc').routingRole).toBe('sink');
    expect(node(twin, 'boiler').routingRole).toBe('none');
  });

  it('lays a line out in flow order, one row per line', () => {
    const twin = toPlantModel(SAMPLE_OBSERVATION);
    const x = (id: string) => node(twin, id).position.x;
    const y = (id: string) => node(twin, id).position.y;
    expect(x('feeder')).toBeLessThan(x('ironer'));
    expect(x('ironer')).toBeLessThan(x('folder'));
    expect(y('feeder')).toBe(y('folder'));
    expect(y('washer-1')).not.toBe(y('feeder'));
    expect(x('wash-line')).toBe(0);
  });

  it('keeps evidence by node, earliest first, and flow details by route', () => {
    const twin = toPlantModel(SAMPLE_OBSERVATION);
    expect(twin.evidence['washer-1']?.[0]?.tSec).toBe(12);
    expect(node(twin, 'washer-1').values[PROPERTY.firstSeenSec]).toBe(12);
    expect(twin.flows['route-washer-1-dryer-1']).toMatchObject({
      material: 'wet linen',
      inferred: false,
    });
  });

  it('repairs a sloppy answer instead of failing', () => {
    const sloppy: WalkthroughObservation = {
      ...SAMPLE_OBSERVATION,
      lines: [{ id: 'Line A', name: 'Line A', areaId: 'nowhere', evidence: [] }],
      equipment: [
        {
          ...(SAMPLE_OBSERVATION.equipment[1] ?? fail('washer-1')),
          id: 'Máy giặt 1',
          name: 'Máy giặt 1',
          lineId: 'Line A',
          areaId: '',
        },
        {
          ...(SAMPLE_OBSERVATION.equipment[2] ?? fail('washer-2')),
          id: 'Máy giặt 1',
          name: 'Máy giặt 1',
          lineId: 'Line A',
          areaId: '',
        },
      ],
      flows: [
        {
          fromId: 'Máy giặt 1',
          toId: 'Máy giặt 1',
          material: 'loop',
          inferred: true,
          evidence: [],
        },
        { fromId: 'Máy giặt 1', toId: 'ghost', material: 'linen', inferred: true, evidence: [] },
      ],
    };
    const twin = toPlantModel(sloppy);
    const ids = twin.draft.nodes.map((value) => value.id);
    expect(ids).toContain('may-giat-1');
    expect(ids).toContain('may-giat-1-2');
    expect(twin.draft.relationships.filter((value) => value.kind === 'routes-to')).toEqual([]);
    expect(twin.warnings).toHaveLength(2);
  });
});

describe('toPlantModel on a real Gemini answer', () => {
  // Recorded from gemini-flash-latest on a synthetic laundry walkthrough.
  it('passes the schema and orders rows by when the camera reached them', async () => {
    const recorded = (await import('./fixtures/plant-walkthrough-synthetic-laundry.json')).default;
    const observation = walkthroughObservationSchema.parse(recorded);
    const twin = toPlantModel(observation);
    expect(twin.warnings).toEqual([]);
    const y = (id: string) => node(twin, id).position.y;
    // Wet area from 0:01, the carts at 0:12, the flatwork line from 0:15.
    expect(y('washer-w1')).toBeLessThan(y('carts-dry-linen'));
    expect(y('carts-dry-linen')).toBeLessThan(y('feeder-fd'));
  });
});
