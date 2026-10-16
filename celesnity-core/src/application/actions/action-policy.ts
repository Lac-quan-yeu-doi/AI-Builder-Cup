import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';

const KNOWN_KEYS = new Set(['mcpEnabled', 'approvalRequired', 'auditRequired']);

export interface ActionPolicyOverride {
  readonly mcpEnabled?: boolean;
  readonly approvalRequired?: boolean;
  readonly auditRequired?: boolean;
}

export type ActionPolicyOverrides = Readonly<Record<string, ActionPolicyOverride>>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Loads and validates the static action-policy file (`config/agent-actions.yaml`
 * by default) that overrides `approvalRequired`/`auditRequired`/`mcpEnabled`
 * per `ActionDefinition.name` — see `chart.actions.ts`, `automation.actions.ts`,
 * and `mcp-catalog.ts`. Fails fast on any malformed entry rather than silently
 * ignoring bad policy.
 */
export function loadActionPolicyOverrides(path: string): ActionPolicyOverrides {
  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = load(raw);
  if (!isPlainObject(parsed)) {
    throw new Error('agent-actions.yaml must be an object keyed by action name');
  }

  const result: Record<string, ActionPolicyOverride> = {};
  for (const [actionName, entry] of Object.entries(parsed)) {
    if (!isPlainObject(entry)) {
      throw new Error(`agent-actions.yaml entry "${actionName}" must be an object`);
    }
    const override: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(entry)) {
      if (!KNOWN_KEYS.has(key)) {
        throw new Error(`agent-actions.yaml entry "${actionName}" has an unknown key: ${key}`);
      }
      if (typeof value !== 'boolean') {
        throw new Error(`agent-actions.yaml entry "${actionName}.${key}" must be a boolean`);
      }
      override[key] = value;
    }
    result[actionName] = override;
  }
  return result;
}
