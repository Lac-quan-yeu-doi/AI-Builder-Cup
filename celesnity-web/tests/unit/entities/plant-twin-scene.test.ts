import { describe, expect, it } from 'vitest';

import { PELLET_LINE_SAMPLE } from '@/app/(workspace)/plant-model/walkthrough/_components/walkthrough-sample';
import { buildTwinScene } from '@/src/entities/models/plant-twin-scene';
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
