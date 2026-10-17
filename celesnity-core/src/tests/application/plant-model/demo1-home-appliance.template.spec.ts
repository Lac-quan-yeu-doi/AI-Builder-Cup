import { demo1HomeAppliance } from '@application/plant-model/plant-model.template.demo1-home-appliance';
import { PLANT_MODEL_TEMPLATES } from '@application/plant-model/plant-model.templates';
import type { PlantModelDraft, PlantNode } from '@domain/plant-model/models/plant-model';
import { validatePlantDraft } from '@domain/plant-model/plant-model.validator';

const template = PLANT_MODEL_TEMPLATES.find((value) => value.id === 'demo1-home-appliance');

function draft(): PlantModelDraft {
  return demo1HomeAppliance;
}

function codeOf(node: PlantNode, draftValue: PlantModelDraft): string | undefined {
  const type = draftValue.nodeTypes.find((value) => value.id === node.nodeTypeId);
  const definition = [...(type?.properties ?? []), ...node.localProperties].find(
    (value) => value.key.endsWith('_code') && value.showOnCard === true,
  );
  const value = definition === undefined ? undefined : node.values[definition.id];
  return typeof value === 'string' ? value : undefined;
}

describe('Demo Data 1 (Home Appliance) plant model template', () => {
  it('is registered under its template id', () => {
    expect(template?.draft).toBe(demo1HomeAppliance);
  });

  it('publishes without validation issues', () => {
    expect(() => validatePlantDraft(draft(), true)).not.toThrow();
  });

  it('stays small enough to read on one screen', () => {
    expect(draft().nodes.length).toBeGreaterThanOrEqual(40);
    expect(draft().nodes.length).toBeLessThanOrEqual(54);
  });

  it('routes the whole freezer process chain from pressing to the warehouse', () => {
    const value = draft();
    const routes = value.relationships.filter((edge) => edge.kind === 'routes-to');
    const codeById = new Map(value.nodes.map((node) => [node.id, codeOf(node, value)]));
    const ordered: string[] = [];
    let current = value.nodes.find((node) => node.routingRole === 'source');
    expect(current).toBeDefined();
    while (current !== undefined) {
      ordered.push(codeById.get(current.id) ?? '');
      const next = routes.find((edge) => edge.sourceNodeId === current?.id);
      current =
        next === undefined ? undefined : value.nodes.find((node) => node.id === next.targetNodeId);
    }

    expect(ordered).toEqual([
      'CUT_PRESS',
      'CAB_FORM',
      'COIL_WIND',
      'LINER_ASSY',
      'PU_FOAM',
      'LID_LINE',
      'ASSY_COOL',
      'VAC_CHG',
      'LEAK_TEST',
      'HIPOT_RUN',
      'FINAL_QC',
      'PACK',
      'FG_WH',
    ]);
  });

  /*
   * Story B in the demo asks the assistant to walk upstream from the leak test
   * to the coil winder. That only answers correctly while both stay on one
   * route, so the traversal is asserted rather than assumed.
   */
  it('places the coil winder upstream of the leak test', () => {
    const value = draft();
    const codeById = new Map(value.nodes.map((node) => [node.id, codeOf(node, value)]));
    const idByCode = new Map([...codeById].map(([id, code]) => [code, id]));
    const routes = value.relationships.filter((edge) => edge.kind === 'routes-to');

    const seen = new Set<string>();
    let cursor = idByCode.get('LEAK_TEST');
    while (cursor !== undefined && !seen.has(cursor)) {
      seen.add(cursor);
      cursor = routes.find((edge) => edge.targetNodeId === cursor)?.sourceNodeId;
    }

    expect([...seen].map((id) => codeById.get(id))).toContain('COIL_WIND');
  });

  it('binds the live properties to the demo warehouse database', () => {
    const bindings = draft()
      .nodeTypes.flatMap((type) => type.properties)
      .filter((property) => property.catalogBinding !== undefined)
      .map((property) => property.catalogBinding);

    expect(bindings).toHaveLength(2);
    for (const binding of bindings) {
      expect(binding?.catalog).toBe('iceberg');
      expect(binding?.schema).toBe('demo1_home_appliance');
      expect(binding?.mode).toBe('scalar');
      expect(binding?.filters[0]?.operand.kind).toBe('property');
    }
  });

  it('keeps every containment parent single and every node reachable from the site', () => {
    const value = draft();
    const contains = value.relationships.filter((edge) => edge.kind === 'contains');
    const parents = new Map(contains.map((edge) => [edge.targetNodeId, edge.sourceNodeId]));
    expect(parents.size).toBe(contains.length);

    const roots = value.nodes.filter((node) => !parents.has(node.id));
    expect(roots).toHaveLength(1);
    expect(codeOf(roots[0] as PlantNode, value)).toBe('DEMO1_HOME_APPLIANCE');
  });
});
