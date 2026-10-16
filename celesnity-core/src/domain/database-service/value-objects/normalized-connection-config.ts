import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';

export type JsonValue = string | number | boolean | null | JsonObject | readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

const invalidJsonValue = (): never => {
  throw ConnectionError.validation(ConnectionMessage.configValueInvalid);
};

const cyclicJsonValue = (): never => {
  throw ConnectionError.validation(ConnectionMessage.configValueCyclic);
};

/** Validates and copies a JSON value while sorting every object's keys. */
const canonicalJsonValue = (value: unknown, ancestors: WeakSet<object>): JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : invalidJsonValue();
  }

  if (typeof value !== 'object') {
    return invalidJsonValue();
  }

  if (ancestors.has(value)) {
    return cyclicJsonValue();
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const normalized: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        normalized.push(canonicalJsonValue(value[index], ancestors));
      }
      return normalized;
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      return invalidJsonValue();
    }

    const source = value as Record<string, unknown>;
    const normalized: Record<string, JsonValue> = {};
    for (const key of Object.keys(source).sort()) {
      Object.defineProperty(normalized, key, {
        configurable: true,
        enumerable: true,
        value: canonicalJsonValue(source[key], ancestors),
        writable: true,
      });
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
};

const canonicalObject = (value: JsonObject): JsonObject => {
  const normalized = canonicalJsonValue(value, new WeakSet<object>());
  if (normalized === null || typeof normalized !== 'object' || Array.isArray(normalized)) {
    return invalidJsonValue();
  }
  return normalized as JsonObject;
};

/** Immutable, schema-versioned, canonical non-secret DBMS configuration. */
export class NormalizedConnectionConfig {
  private constructor(
    public readonly schemaVersion: number,
    private readonly value: JsonObject,
    private readonly canonical: string,
  ) {}

  public static create(schemaVersion: number, value: JsonObject): NormalizedConnectionConfig {
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
      throw ConnectionError.validation(ConnectionMessage.configSchemaVersionInvalid);
    }
    const normalized = canonicalObject(value);
    return new NormalizedConnectionConfig(schemaVersion, normalized, JSON.stringify(normalized));
  }

  public toRecord(): JsonObject {
    return canonicalObject(this.value);
  }

  public equals(other: NormalizedConnectionConfig): boolean {
    return this.schemaVersion === other.schemaVersion && this.canonical === other.canonical;
  }
}
