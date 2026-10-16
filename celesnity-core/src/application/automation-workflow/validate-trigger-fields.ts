import type {
  AutomationWorkflowTriggerField,
  AutomationWorkflowTriggerFieldType,
} from '@domain/automation-workflow/models/automation-workflow';

const SUPPORTED_TYPES: readonly AutomationWorkflowTriggerFieldType[] = [
  'text',
  'number',
  'date',
  'datetime',
  'boolean',
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates and normalizes a raw `triggerFields` payload into typed domain
 * trigger fields. `undefined` yields `[]`; anything else must be an array of
 * `{ name, type, label?, required? }` objects. `required` defaults to `true`;
 * `label` is optional. Rejects unknown types, non-string/empty names, and
 * duplicate names — a pure function, safe to call at any layer.
 */
export function validateTriggerFields(raw: unknown): AutomationWorkflowTriggerField[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new Error('triggerFields must be an array');
  }

  const seen = new Set<string>();
  return raw.map((item, index) => {
    if (!isPlainObject(item)) {
      throw new Error(`triggerFields[${index}] must be an object`);
    }
    const { name, type, label, required } = item;

    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error(`triggerFields[${index}] name must be a non-empty string`);
    }
    if (
      typeof type !== 'string' ||
      !SUPPORTED_TYPES.includes(type as AutomationWorkflowTriggerFieldType)
    ) {
      throw new Error(`triggerFields[${index}] type must be one of ${SUPPORTED_TYPES.join(', ')}`);
    }
    if (seen.has(name)) {
      throw new Error(`triggerFields has a duplicate name: ${name}`);
    }
    seen.add(name);

    if (label !== undefined && typeof label !== 'string') {
      throw new Error(`triggerFields[${index}] label must be a string when provided`);
    }
    if (required !== undefined && typeof required !== 'boolean') {
      throw new Error(`triggerFields[${index}] required must be a boolean when provided`);
    }

    const field: AutomationWorkflowTriggerField = {
      name,
      type: type as AutomationWorkflowTriggerFieldType,
      ...(label !== undefined ? { label } : {}),
      required: required ?? true,
    };
    return field;
  });
}
