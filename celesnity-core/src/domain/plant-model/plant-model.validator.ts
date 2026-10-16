import { PlantModelError } from './errors/plant-model.errors';
import type {
  PlantModelDraft,
  PlantNode,
  PlantPropertyDefinition,
  PlantPropertyValue,
} from './models/plant-model';

const KEY = /^[A-Za-z0-9_]+$/u;
const MAX_NODE_TYPES = 100;
const MAX_NODES = 2000;
const MAX_RELATIONSHIPS = 5000;

export function validatePlantDraft(draft: PlantModelDraft, publish = false): void {
  const raw = draft as unknown as Readonly<Record<string, unknown>>;
  if (
    !Array.isArray(raw.nodeTypes) ||
    !Array.isArray(raw.nodes) ||
    !Array.isArray(raw.relationships)
  ) {
    invalid('The plant model must contain nodeTypes, nodes, and relationships arrays.');
  }
  for (const type of draft.nodeTypes) {
    if (!record(type) || typeof type.id !== 'string' || !Array.isArray(type.properties))
      invalid('A node type is malformed.');
  }
  for (const node of draft.nodes) {
    if (
      !record(node) ||
      typeof node.id !== 'string' ||
      typeof node.nodeTypeId !== 'string' ||
      !record(node.position) ||
      !record(node.values) ||
      !Array.isArray(node.localProperties)
    )
      invalid('A node is malformed.');
  }
  for (const relationship of draft.relationships) {
    if (
      !record(relationship) ||
      typeof relationship.id !== 'string' ||
      !['contains', 'routes-to'].includes(relationship.kind) ||
      typeof relationship.sourceNodeId !== 'string' ||
      typeof relationship.targetNodeId !== 'string'
    )
      invalid('A relationship is malformed.');
  }
  if (draft.nodeTypes.length > MAX_NODE_TYPES)
    invalid('A plant may contain at most 100 node types.');
  if (draft.nodes.length > MAX_NODES) invalid('A plant may contain at most 2000 nodes.');
  if (draft.relationships.length > MAX_RELATIONSHIPS)
    invalid('A plant may contain at most 5000 relationships.');

  unique(
    draft.nodeTypes.map((value) => value.id),
    'node type id',
  );
  unique(
    draft.nodes.map((value) => value.id),
    'node id',
  );
  unique(
    draft.relationships.map((value) => value.id),
    'relationship id',
  );
  const nodeTypes = new Map(draft.nodeTypes.map((value) => [value.id, value]));
  const nodes = new Map(draft.nodes.map((value) => [value.id, value]));

  for (const type of draft.nodeTypes) {
    text(type.name, 160, 'Node type name');
    unique(
      type.properties.map((value) => value.id),
      `property id on ${type.name}`,
    );
    unique(
      type.properties.map((value) => value.key.toLowerCase()),
      `property key on ${type.name}`,
    );
    type.properties.forEach(validateDefinition);
  }

  for (const node of draft.nodes) {
    text(node.name, 160, 'Node name');
    if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))
      invalid(`${node.name} has an invalid canvas position.`);
    const type = nodeTypes.get(node.nodeTypeId);
    if (type === undefined) invalid(`${node.name} refers to a missing node type.`);
    if (!['source', 'intermediate', 'sink', 'none'].includes(node.routingRole))
      invalid(`${node.name} has an invalid routing role.`);
    unique(
      node.localProperties.map((value) => value.id),
      `local property id on ${node.name}`,
    );
    node.localProperties.forEach(validateDefinition);
    const definitions = [...type.properties, ...node.localProperties];
    unique(
      definitions.map((value) => value.id),
      `property id on ${node.name}`,
    );
    for (const [definitionId, value] of Object.entries(node.values)) {
      const definition = definitions.find((candidate) => candidate.id === definitionId);
      if (definition === undefined) invalid(`${node.name} has a value for an unknown property.`);
      validateValue(definition, value, nodes);
    }
    if (publish) {
      for (const definition of definitions.filter((candidate) => candidate.required)) {
        if (isMissing(node.values[definition.id]) && definition.type !== 'catalog-scalar') {
          invalid(`${node.name} is missing required property ${definition.name}.`);
        }
      }
    }
  }

  const parents = new Set<string>();
  for (const relationship of draft.relationships) {
    if (!nodes.has(relationship.sourceNodeId) || !nodes.has(relationship.targetNodeId))
      invalid('A relationship refers to a missing node.');
    if (relationship.sourceNodeId === relationship.targetNodeId)
      invalid('A relationship cannot connect a node to itself.');
    if (relationship.kind === 'contains') {
      if (parents.has(relationship.targetNodeId)) invalid('A node may have only one parent.');
      parents.add(relationship.targetNodeId);
    }
  }
  assertContainmentAcyclic(draft);
  if (publish) assertPublishableRoutes(draft, nodes);
}

function validateDefinition(definition: PlantPropertyDefinition): void {
  const rawDefinition: unknown = definition;
  if (
    !record(rawDefinition) ||
    typeof definition.id !== 'string' ||
    typeof definition.key !== 'string' ||
    typeof definition.required !== 'boolean' ||
    !Number.isInteger(definition.order) ||
    ![
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
    ].includes(definition.type)
  )
    invalid('A property definition is malformed.');
  text(definition.name, 160, 'Property name');
  if (!KEY.test(definition.key) || definition.key.length > 120)
    invalid(`${definition.name} must have a catalog-safe key.`);
  if (!Number.isInteger(definition.order) || definition.order < 0)
    invalid(`${definition.name} has an invalid display order.`);
  if (definition.showOnCard !== undefined && typeof definition.showOnCard !== 'boolean')
    invalid(`${definition.name} has an invalid node-card display setting.`);
  const choice = definition.type === 'single-select' || definition.type === 'multi-select';
  if (choice && (definition.options === undefined || definition.options.length === 0))
    invalid(`${definition.name} needs at least one value-set option.`);
  if (definition.options !== undefined) {
    if (!validOptions(definition.options)) invalid(`${definition.name} has invalid options.`);
    unique(
      definition.options.map((value) => value.id),
      `option id on ${definition.name}`,
    );
    definition.options.forEach((option) => text(option.label, 160, 'Option label'));
  }
  const catalog =
    definition.type === 'catalog-scalar' ||
    definition.type === 'catalog-choices' ||
    definition.type === 'catalog-multi-select';
  if (catalog !== (definition.catalogBinding !== undefined))
    invalid(`${definition.name} has an incompatible catalog binding.`);
  const binding = definition.catalogBinding;
  if (binding !== undefined) {
    const rawBinding: unknown = binding;
    if (!record(rawBinding) || !validFilters(rawBinding.filters))
      invalid(`${definition.name} has an invalid catalog binding.`);
    if (typeof binding.mode !== 'string' || !['scalar', 'choices'].includes(binding.mode))
      invalid(`${definition.name} has an invalid catalog mode.`);
    for (const value of [binding.catalog, binding.schema, binding.table, binding.valueColumn]) {
      if (!KEY.test(value)) invalid(`${definition.name} contains an invalid catalog identifier.`);
    }
    if (binding.labelColumn !== undefined && !KEY.test(binding.labelColumn))
      invalid(`${definition.name} contains an invalid label column.`);
    if ((binding.limit ?? 100) < 1 || (binding.limit ?? 100) > 500)
      invalid(`${definition.name} has an invalid lookup limit.`);
  }
}

function validateValue(
  definition: PlantPropertyDefinition,
  value: PlantPropertyValue,
  nodes: ReadonlyMap<string, PlantNode>,
): void {
  const valid =
    (definition.type === 'text' && typeof value === 'string') ||
    (definition.type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
    (definition.type === 'boolean' && typeof value === 'boolean') ||
    (definition.type === 'datetime' &&
      typeof value === 'string' &&
      !Number.isNaN(Date.parse(value))) ||
    (definition.type === 'single-select' && typeof value === 'string') ||
    (definition.type === 'multi-select' &&
      Array.isArray(value) &&
      value.every((item) => typeof item === 'string')) ||
    (definition.type === 'node-reference' && typeof value === 'string' && nodes.has(value)) ||
    (definition.type === 'catalog-choices' && typeof value === 'string') ||
    (definition.type === 'catalog-multi-select' &&
      Array.isArray(value) &&
      value.every((item) => typeof item === 'string')) ||
    definition.type === 'catalog-scalar';
  if (!valid) invalid(`${definition.name} has a value of the wrong type.`);
  if (definition.type === 'single-select' && typeof value === 'string') {
    const option = definition.options?.find((candidate) => candidate.id === value);
    if (option === undefined) invalid(`${definition.name} refers to an unavailable option.`);
  }
}

function assertContainmentAcyclic(draft: PlantModelDraft): void {
  const parent = new Map(
    draft.relationships
      .filter((value) => value.kind === 'contains')
      .map((value) => [value.targetNodeId, value.sourceNodeId]),
  );
  for (const node of draft.nodes) {
    const seen = new Set<string>([node.id]);
    let current = parent.get(node.id);
    while (current !== undefined) {
      if (seen.has(current)) invalid('The containment hierarchy contains a cycle.');
      seen.add(current);
      current = parent.get(current);
    }
  }
}

function assertPublishableRoutes(
  draft: PlantModelDraft,
  nodes: ReadonlyMap<string, PlantNode>,
): void {
  const routes = draft.relationships.filter((value) => value.kind === 'routes-to');
  for (const node of nodes.values()) {
    const role = node.routingRole;
    if (role === 'none') continue;
    const incoming = routes.some((value) => value.targetNodeId === node.id);
    const outgoing = routes.some((value) => value.sourceNodeId === node.id);
    if (
      (role === 'source' && !outgoing) ||
      (role === 'sink' && !incoming) ||
      (role === 'intermediate' && (!incoming || !outgoing))
    ) {
      invalid(`${node.name} does not satisfy its ${role} routing role.`);
    }
  }
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) invalid(`Duplicate ${label}.`);
}
function text(value: string, max: number, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max)
    invalid(`${label} is invalid.`);
}
function invalid(message: string): never {
  throw PlantModelError.validation(message);
}

function isMissing(value: PlantPropertyValue | undefined): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validOptions(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((option: unknown) => record(option) && typeof option.id === 'string')
  );
}

function validFilters(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (filter: unknown) =>
        record(filter) &&
        typeof filter.column === 'string' &&
        typeof filter.operator === 'string' &&
        ['eq', 'ne', 'lt', 'lte', 'gt', 'gte'].includes(filter.operator) &&
        record(filter.operand) &&
        typeof filter.operand.kind === 'string' &&
        ['literal', 'property'].includes(filter.operand.kind),
    )
  );
}
