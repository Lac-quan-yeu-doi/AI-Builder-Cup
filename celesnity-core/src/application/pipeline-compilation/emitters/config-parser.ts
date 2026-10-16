import { PipelineCompilationError } from '@domain/pipeline-compilation/errors/pipeline-compilation.error';

export function requiredString(
  config: Readonly<Record<string, unknown>>,
  key: string,
  nodeId: string,
): string {
  const value = config[key];
  if (typeof value !== 'string' || value.trim() === '') {
    invalid(nodeId, key, `${key} is required.`);
  }
  return value.trim();
}

export function optionalString(
  config: Readonly<Record<string, unknown>>,
  key: string,
  nodeId: string,
): string | undefined {
  const value = config[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') invalid(nodeId, key, `${key} must be a string.`);
  return value.trim() || undefined;
}

export function stringList(
  config: Readonly<Record<string, unknown>>,
  key: string,
  nodeId: string,
  options: { readonly required?: boolean } = {},
): readonly string[] {
  const value = config[key];
  if (value === undefined && options.required !== true) return [];
  if (!Array.isArray(value)) {
    invalid(nodeId, key, `${key} must be a list of strings.`);
  }
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      invalid(nodeId, key, `${key} must be a list of strings.`);
    }
    const normalized = entry.trim();
    if (normalized !== '') result.push(normalized);
  }
  if (options.required === true && result.length === 0) {
    invalid(nodeId, key, `${key} requires at least one value.`);
  }
  return result;
}

export function recordList(
  config: Readonly<Record<string, unknown>>,
  key: string,
  nodeId: string,
  options: { readonly required?: boolean } = {},
): readonly Readonly<Record<string, unknown>>[] {
  const value = config[key];
  if (value === undefined && options.required !== true) return [];
  if (!Array.isArray(value)) {
    invalid(nodeId, key, `${key} must be a list of structured values.`);
  }
  const result: Readonly<Record<string, unknown>>[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      invalid(nodeId, key, `${key} must be a list of structured values.`);
    }
    result.push(entry);
  }
  if (options.required === true && value.length === 0) {
    invalid(nodeId, key, `${key} requires at least one value.`);
  }
  return result;
}

export function enumValue<TValue extends string>(
  config: Readonly<Record<string, unknown>>,
  key: string,
  values: readonly TValue[],
  nodeId: string,
): TValue {
  const value = requiredString(config, key, nodeId);
  if (!values.includes(value as TValue)) {
    invalid(nodeId, key, `${key} must be one of ${values.join(', ')}.`);
  }
  return value as TValue;
}

export function invalid(nodeId: string, field: string, message: string): never {
  throw PipelineCompilationError.issue('NODE_CONFIG_INVALID', message, { nodeId, field });
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function typedValue(value: unknown, nodeId: string, field: string): unknown {
  if (!isRecord(value)) return value;
  const type = requiredString(value, 'type', nodeId);
  const raw = value.value;
  switch (type) {
    case 'STRING':
      if (typeof raw !== 'string') invalid(nodeId, field, `${field} must contain a string.`);
      return raw;
    case 'INTEGER': {
      const parsed = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isSafeInteger(parsed))
        invalid(nodeId, field, `${field} must contain an integer.`);
      return parsed;
    }
    case 'DECIMAL': {
      const parsed = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(parsed)) invalid(nodeId, field, `${field} must contain a number.`);
      return parsed;
    }
    case 'BOOLEAN':
      if (raw === true || raw === false) return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return invalid(nodeId, field, `${field} must contain a boolean.`);
    case 'NULL':
      return null;
    default:
      return invalid(nodeId, field, `${field} has unsupported literal type ${type}.`);
  }
}
