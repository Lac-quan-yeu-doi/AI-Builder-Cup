import { PLANT_MODEL_TEMPLATES } from '@application/plant-model/plant-model.templates';
import type { PlantPropertyType } from '@domain/plant-model/models/plant-model';
import { validatePlantDraft } from '@domain/plant-model/plant-model.validator';

const supportedPropertyTypes: readonly PlantPropertyType[] = [
  'text',
  'number',
  'boolean',
  'datetime',
  'single-select',
  'multi-select',
  'node-reference',
  'catalog-scalar',
  'catalog-choices',
  'catalog-multi-select',
];

describe('plant model templates', () => {
  it('provides a publishable showcase with every supported property type populated', () => {
    const showcase = PLANT_MODEL_TEMPLATES.find(
      (template) => template.id === 'property-type-showcase',
    );

    expect(showcase).toBeDefined();
    expect(() => validatePlantDraft(showcase!.draft, true)).not.toThrow();

    const definitions = showcase!.draft.nodeTypes.flatMap((type) => type.properties);
    const localDefinitions = showcase!.draft.nodes.flatMap((node) => node.localProperties);
    const representedTypes = new Set(
      [...definitions, ...localDefinitions].map((definition) => definition.type),
    );

    expect(representedTypes).toEqual(new Set(supportedPropertyTypes));
    for (const definition of definitions.filter(
      (candidate) => candidate.type !== 'catalog-scalar',
    )) {
      expect(showcase!.draft.nodes.some((node) => node.values[definition.id] !== undefined)).toBe(
        true,
      );
    }
    expect(new Set(showcase!.draft.nodes.map((node) => node.nodeTypeId)).size).toBe(
      showcase!.draft.nodeTypes.length,
    );
  });
});
