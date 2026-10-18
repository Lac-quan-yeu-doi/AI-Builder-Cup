import { describe, expect, it } from 'vitest';

import { PELLET_LINE_SAMPLE } from '@/app/(workspace)/plant-model/walkthrough/_components/walkthrough-sample';
import { buildTwinScene, plantTwinScene } from '@/src/entities/models/plant-twin-scene';
import { walkthroughToTwin as toPlantModel } from '@/src/entities/models/plant-walkthrough';
import { SAMPLE_OBSERVATION } from './fixtures/plant-walkthrough-harbor-linen';

const inside = (
  zone: { minX: number; maxX: number; minZ: number; maxZ: number },
  x: number,
  z: number,
) => x > zone.minX && x < zone.maxX && z > zone.minZ && z < zone.maxZ;

describe('buildTwinScene', () => {
  const scene = buildTwinScene(toPlantModel(SAMPLE_OBSERVATION));

  it('places every machine and every flow', () => {
    expect(scene.machines).toHaveLength(10);
    expect(scene.flows).toHaveLength(8);
    expect(scene.machines.find((machine) => machine.id === 'washer-2')).toMatchObject({
      kind: 'machine',
      state: 'idle',
      lineId: 'wash-line',
      areaId: 'wet-hall',
    });
  });

  it('wraps each line and area around its own machines', () => {
    for (const zone of scene.zones) {
      const members = scene.machines.filter((machine) =>
        zone.kind === 'area' ? machine.areaId === zone.id : machine.lineId === zone.id,
      );
      expect(members.length).toBeGreaterThan(0);
      for (const machine of members) expect(inside(zone, machine.x, machine.z)).toBe(true);
    }
    expect(scene.zones.map((zone) => zone.kind)).toEqual(['area', 'area', 'line', 'line']);
  });

  it('keeps area zones apart', () => {
    const [a, b] = scene.zones.filter((zone) => zone.kind === 'area');
    if (a === undefined || b === undefined) throw new Error('expected two areas');
    const overlap = a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
    expect(overlap).toBe(false);
  });

  it('builds a scene for the bundled pellet line sample', () => {
    const built = buildTwinScene(toPlantModel(PELLET_LINE_SAMPLE));
    expect(built.machines.length).toBeGreaterThan(0);
    expect(built.bounds.maxX).toBeGreaterThan(built.bounds.minX);
  });
});

describe('plantTwinScene', () => {
  // A saved plant, shaped like the seeded demos: the plant contains areas,
  // areas contain work centers, work centers contain equipment. Positions are
  // the editor's tree layout, not a floor plan.
  const type = (id: string, name: string) => ({ id, name, properties: [] });
  const node = (id: string, nodeTypeId: string, x: number, y: number) => ({
    id,
    name: id,
    nodeTypeId,
    routingRole: 'none' as const,
    position: { x, y },
    values: {},
    localProperties: [],
  });
  const contains = (source: string, target: string) => ({
    id: `${source}>${target}`,
    kind: 'contains' as const,
    sourceNodeId: source,
    targetNodeId: target,
  });
  const routes = (source: string, target: string, name?: string) => ({
    id: `${source}->${target}`,
    kind: 'routes-to' as const,
    sourceNodeId: source,
    targetNodeId: target,
    name,
  });
  const draft = {
    nodeTypes: [
      type('t-area', 'Area / Room'),
      type('t-line', 'Line'),
      type('t-wc', 'Work center'),
      type('t-eq', 'Equipment'),
      type('t-wh', 'Warehouse'),
    ],
    nodes: [
      node('plant', 't-area', 0, 0),
      node('press-shop', 't-area', 0, 100),
      node('empty-line', 't-line', 200, 100),
      node('press-cell', 't-wc', 0, 200),
      node('press-1', 't-eq', 0, 300),
      node('press-2', 't-eq', 100, 300),
      node('pack-room', 't-area', 300, 100),
      node('packer', 't-wc', 300, 200),
      node('store', 't-wh', 400, 200),
    ],
    relationships: [
      contains('plant', 'press-shop'),
      contains('plant', 'pack-room'),
      contains('press-shop', 'empty-line'),
      contains('press-shop', 'press-cell'),
      contains('press-cell', 'press-1'),
      contains('press-cell', 'press-2'),
      contains('pack-room', 'packer'),
      contains('pack-room', 'store'),
      routes('press-1', 'press-2', 'panels'),
      routes('press-cell', 'packer', 'cabinets'),
      routes('packer', 'store'),
    ],
  };
  const scene = plantTwinScene(draft);

  it('places every machine and skips containers, empty lines included', () => {
    expect(scene.machines.map((machine) => machine.id).sort()).toEqual([
      'packer',
      'press-1',
      'press-2',
      'store',
    ]);
    expect(scene.machines.find((machine) => machine.id === 'store')).toMatchObject({
      kind: 'storage',
      state: 'unknown',
      equipmentType: 'Warehouse',
      areaId: 'pack-room',
    });
    expect(scene.machines.find((machine) => machine.id === 'press-1')).toMatchObject({
      lineId: 'press-cell',
      areaId: 'press-shop',
    });
  });

  it('turns each area into a floor zone and each work center into a row', () => {
    expect(scene.zones.map((zone) => [zone.kind, zone.id])).toEqual([
      ['area', 'press-shop'],
      ['area', 'pack-room'],
      ['line', 'press-cell'],
    ]);
    for (const zone of scene.zones) {
      const members = scene.machines.filter((machine) =>
        zone.kind === 'area' ? machine.areaId === zone.id : machine.lineId === zone.id,
      );
      for (const machine of members) expect(inside(zone, machine.x, machine.z)).toBe(true);
    }
    const [a, b] = scene.zones.filter((zone) => zone.kind === 'area');
    if (a === undefined || b === undefined) throw new Error('expected two areas');
    const overlap = a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
    expect(overlap).toBe(false);
  });

  it('draws every recorded route as a seen flow, from the middle of a work center when it starts there', () => {
    expect(scene.flows).toHaveLength(3);
    expect(scene.flows.every((flow) => !flow.inferred)).toBe(true);
    const fromCell = scene.flows.find((flow) => flow.fromId === 'press-cell');
    const [one, two] = ['press-1', 'press-2'].map((id) =>
      scene.machines.find((machine) => machine.id === id),
    );
    if (fromCell === undefined || one === undefined || two === undefined) {
      throw new Error('expected the work-center route and both presses');
    }
    expect(fromCell.from).toEqual([(one.x + two.x) / 2, (one.z + two.z) / 2]);
    expect(fromCell.material).toBe('cabinets');
  });

  it('keeps the floor plan of a plant made from a walkthrough', () => {
    const walked = toPlantModel(SAMPLE_OBSERVATION);
    const kept = plantTwinScene(walked.draft);
    expect(kept.machines.map((machine) => [machine.id, machine.x, machine.z])).toEqual(
      buildTwinScene(walked).machines.map((machine) => [machine.id, machine.x, machine.z]),
    );
    expect(kept.flows.every((flow) => !flow.inferred)).toBe(true);
  });
});
