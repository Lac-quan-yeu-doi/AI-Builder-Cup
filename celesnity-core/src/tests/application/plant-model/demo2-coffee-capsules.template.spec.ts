import { PLANT_MODEL_TEMPLATES } from '@application/plant-model/plant-model.templates';
import type { PlantModelDraft, PlantNode } from '@domain/plant-model/models/plant-model';
import { validatePlantDraft } from '@domain/plant-model/plant-model.validator';

const template = PLANT_MODEL_TEMPLATES.find((value) => value.id === 'demo2-coffee-capsules');

/*
 * `STATIONS` from mock-data/demo2-coffee-capsules/reference.mjs, in route order. The
 * warehouse joins on `L<n>_<station>`, so the template must spell every one.
 */
const STATIONS = [
  'POWDER_FEED',
  'CUP_DENEST',
  'DOSE_TAMP',
  'N2_FLUSH',
  'LID_SEAL',
  'CAP_INSPECT',
  'TRANSFER',
  'CARTON',
  'BOX_CHECK',
  'BUNDLE',
  'PALLETIZE',
] as const;
const LINES = ['L1', 'L2'] as const;
const WORKCENTERS = LINES.flatMap((line) => STATIONS.map((station) => `${line}_${station}`));

function draft(): PlantModelDraft {
  if (template === undefined) throw new Error('The Demo Data 2 (coffee capsules) template is missing.');
  return template.draft;
}

function codeOf(node: PlantNode, draftValue: PlantModelDraft): string | undefined {
  const type = draftValue.nodeTypes.find((value) => value.id === node.nodeTypeId);
  const definition = [...(type?.properties ?? []), ...node.localProperties].find(
    (value) => value.key.endsWith('_code') && value.showOnCard === true,
  );
  const value = definition === undefined ? undefined : node.values[definition.id];
  return typeof value === 'string' ? value : undefined;
}

describe('Demo Data 2 coffee-capsule plant model template', () => {
  it('publishes without validation issues', () => {
    expect(() => validatePlantDraft(draft(), true)).not.toThrow();
  });

  it('stays small enough to read on one screen', () => {
    expect(draft().nodes.length).toBeGreaterThanOrEqual(50);
    expect(draft().nodes.length).toBeLessThanOrEqual(56);
  });

  it('routes each line from the powder source through all eleven stations to the warehouse', () => {
    const value = draft();
    const routes = value.relationships.filter((edge) => edge.kind === 'routes-to');
    const codeById = new Map(value.nodes.map((node) => [node.id, codeOf(node, value)]));
    const sources = value.nodes.filter((node) => node.routingRole === 'source');
    expect(sources).toHaveLength(1);
    const source = sources[0] as PlantNode;

    const walks = routes
      .filter((edge) => edge.sourceNodeId === source.id)
      .map((first) => {
        const ordered = [codeById.get(source.id) ?? ''];
        const seen = new Set<string>([source.id]);
        let cursor: string | undefined = first.targetNodeId;
        while (cursor !== undefined && !seen.has(cursor)) {
          seen.add(cursor);
          ordered.push(codeById.get(cursor) ?? '');
          const from: string = cursor;
          cursor = routes.find((edge) => edge.sourceNodeId === from)?.targetNodeId;
        }
        return ordered;
      });

    expect(walks).toEqual(
      LINES.map((line) => [
        'UPSTREAM_POWDER',
        ...STATIONS.map((station) => `${line}_${station}`),
        'FG_WH',
      ]),
    );
  });

  it('binds the live properties to the Demo Data 2 warehouse database', () => {
    const value = draft();
    const definitions = [
      ...value.nodeTypes.flatMap((type) => type.properties),
      ...value.nodes.flatMap((node) => node.localProperties),
    ];
    const bindings = definitions
      .map((property) => property.catalogBinding)
      .filter((binding) => binding !== undefined);

    expect(bindings.length).toBeGreaterThan(0);
    for (const binding of bindings) {
      expect(binding.catalog).toBe('iceberg');
      expect(binding.schema).toBe('demo2_coffee_capsules');
      expect(binding.mode).toBe('scalar');
      expect(binding.filters.length).toBeGreaterThan(0);
      for (const filter of binding.filters) expect(filter.operand.kind).toBe('property');
    }
    expect(new Set(bindings.map((binding) => binding.table))).toEqual(
      new Set(['dm_workcenter_status', 'dm_asset_health', 'dm_room_env']),
    );
  });

  it('keeps every containment parent single and every node reachable from the site', () => {
    const value = draft();
    const contains = value.relationships.filter((edge) => edge.kind === 'contains');
    const parents = new Map(contains.map((edge) => [edge.targetNodeId, edge.sourceNodeId]));
    expect(parents.size).toBe(contains.length);

    const roots = value.nodes.filter((node) => !parents.has(node.id));
    expect(roots).toHaveLength(1);
    expect(codeOf(roots[0] as PlantNode, value)).toBe('DEMO2_COFFEE_CAPSULES');
  });

  it('spells every station code exactly as the reference does', () => {
    const value = draft();
    const stations = value.nodes
      .filter((node) => node.routingRole === 'intermediate')
      .map((node) => codeOf(node, value));

    expect(stations).toEqual(WORKCENTERS);
  });
});
