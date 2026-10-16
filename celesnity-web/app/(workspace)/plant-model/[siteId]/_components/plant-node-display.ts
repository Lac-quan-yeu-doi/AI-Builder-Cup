import type {
  PlantModelDraft,
  PlantNode,
  PlantNodeType,
  PlantPropertyDefinition,
  PlantPropertyValue,
} from '@/src/entities/models/plant-model';

export interface PlantNodeDisplayLabels {
  readonly trueValue: string;
  readonly falseValue: string;
  readonly liveValue: string;
  readonly notSet: string;
}

export interface PlantNodeDisplayField {
  readonly id: string;
  readonly name: string;
  readonly value: string;
}

export interface PlantNodeDisplay {
  readonly cardFields: readonly PlantNodeDisplayField[];
  readonly details: readonly PlantNodeDisplayField[];
}

export interface PlantTopologyNodeDisplay extends PlantNodeDisplay {
  readonly type: PlantNodeType | undefined;
  readonly statusField: PlantNodeDisplayField | undefined;
}

export function buildPlantNodeDisplay(
  node: PlantNode,
  type: PlantNodeType,
  draft: PlantModelDraft,
  labels: PlantNodeDisplayLabels,
): PlantNodeDisplay {
  const definitions = [...type.properties, ...node.localProperties].sort(
    (left, right) => left.order - right.order,
  );
  const details = definitions.map((definition) => ({
    id: definition.id,
    name: definition.name,
    value: displayValue(definition, node.values[definition.id], draft, labels),
  }));
  const visible = new Set(
    definitions.filter((definition) => definition.showOnCard).map(({ id }) => id),
  );
  return {
    cardFields: details.filter((field) => visible.has(field.id) && field.value !== labels.notSet),
    details,
  };
}

export function buildPlantTopologyNodeDisplays(
  draft: PlantModelDraft,
  labels: PlantNodeDisplayLabels,
): ReadonlyMap<string, PlantTopologyNodeDisplay> {
  return new Map(
    draft.nodes.map((node) => {
      const type = draft.nodeTypes.find((candidate) => candidate.id === node.nodeTypeId);
      const display = type
        ? buildPlantNodeDisplay(node, type, draft, labels)
        : { cardFields: [], details: [] };
      const statusField = display.details.find(
        (field) => /status|state/u.test(field.name.toLowerCase()) && field.value !== labels.notSet,
      );
      return [node.id, { type, ...display, statusField }] as const;
    }),
  );
}

function displayValue(
  definition: PlantPropertyDefinition,
  value: PlantPropertyValue | undefined,
  draft: PlantModelDraft,
  labels: PlantNodeDisplayLabels,
): string {
  if (definition.type === 'catalog-scalar') return labels.liveValue;
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return labels.notSet;
  }
  if (typeof value === 'boolean') return value ? labels.trueValue : labels.falseValue;
  if (definition.type === 'node-reference' && typeof value === 'string') {
    return draft.nodes.find((candidate) => candidate.id === value)?.name ?? value;
  }
  if (
    (definition.type === 'single-select' || definition.type === 'multi-select') &&
    definition.options !== undefined
  ) {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map(
        (selected) =>
          definition.options?.find((option) => option.id === selected)?.label ?? selected,
      )
      .join(', ');
  }
  return Array.isArray(value) ? value.join(', ') : String(value);
}
