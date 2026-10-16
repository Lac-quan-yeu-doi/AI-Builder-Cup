export interface GovernancePolicy {
  readonly actionApprovals: Readonly<Record<string, boolean>>;
  readonly autoApprovals?: readonly string[];
  readonly autonomy: "manual" | "safe" | "supervised";
  readonly sandbox: {
    readonly enabled: boolean;
    readonly allowedCommands: readonly string[];
    readonly writablePaths: readonly string[];
  };
  readonly sensitiveFiles: "deny" | "allow_templates";
  readonly budget: {
    readonly maxInputTokens: number;
    readonly maxOutputTokens: number;
    readonly maxToolCalls: number;
    readonly maxCostUsd: number | null;
  };
}

const DEFAULT_BUDGET = {
  maxInputTokens: 128000,
  maxOutputTokens: 16384,
  maxToolCalls: 50,
  maxCostUsd: null,
} as const;

const GOVERNANCE_KEYS = [
  "action_approvals",
  "auto_approvals",
  "autonomy",
  "sandbox",
  "sensitive_files",
  "budget",
] as const;

const SANDBOX_KEYS = ["enabled", "allowed_commands", "writable_paths"] as const;

const BUDGET_KEYS = [
  "max_input_tokens",
  "max_output_tokens",
  "max_tool_calls",
  "max_cost_usd",
] as const;

export function parseGovernancePolicy(value: unknown): GovernancePolicy {
  if (value === undefined) return defaultGovernancePolicy();
  const input = policyRecord(value, "governance", GOVERNANCE_KEYS);
  return {
    actionApprovals: actionApprovals(input.action_approvals),
    autoApprovals: autoApprovals(input.auto_approvals ?? []),
    autonomy: policyEnum(
      input.autonomy ?? "manual",
      ["manual", "safe", "supervised"] as const,
      "governance.autonomy",
    ),
    sandbox: sandbox(input.sandbox),
    sensitiveFiles: policyEnum(
      input.sensitive_files ?? "deny",
      ["deny", "allow_templates"] as const,
      "governance.sensitive_files",
    ),
    budget: budget(input.budget),
  };
}

function defaultGovernancePolicy(): GovernancePolicy {
  return {
    actionApprovals: {},
    // Tool approvals are opt-in for manifests that do not declare governance.
    // Explicit action approvals still take precedence at runtime.
    autoApprovals: ["*"],
    autonomy: "manual",
    sandbox: { enabled: false, allowedCommands: [], writablePaths: [] },
    sensitiveFiles: "deny",
    budget: { ...DEFAULT_BUDGET },
  };
}

function actionApprovals(value: unknown): Readonly<Record<string, boolean>> {
  const input = policyRecord(value ?? {}, "governance.action_approvals");
  return Object.fromEntries(
    Object.entries(input).map(([action, approval]) => {
      if (
        !/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/u.test(action) ||
        typeof approval !== "boolean"
      )
        throw policyError("governance.action_approvals");
      return [action, approval];
    }),
  );
}

function autoApprovals(value: unknown): readonly string[] {
  const values = strings(value, "governance.auto_approvals");
  if (
    values.some(
      (action) =>
        action !== "*" && !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(action),
    )
  )
    throw policyError("governance.auto_approvals");
  return values;
}

function sandbox(value: unknown): GovernancePolicy["sandbox"] {
  const input = policyRecord(value ?? {}, "governance.sandbox", SANDBOX_KEYS);
  const enabled = input.enabled ?? false;
  if (typeof enabled !== "boolean")
    throw policyError("governance.sandbox.enabled");
  return {
    enabled,
    allowedCommands: strings(
      input.allowed_commands ?? [],
      "governance.sandbox.allowed_commands",
    ),
    writablePaths: paths(
      input.writable_paths ?? [],
      "governance.sandbox.writable_paths",
    ),
  };
}

function budget(value: unknown): GovernancePolicy["budget"] {
  const input = policyRecord(value ?? {}, "governance.budget", BUDGET_KEYS);
  return {
    maxInputTokens: positiveInteger(
      input.max_input_tokens ?? DEFAULT_BUDGET.maxInputTokens,
      "governance.budget.max_input_tokens",
    ),
    maxOutputTokens: positiveInteger(
      input.max_output_tokens ?? DEFAULT_BUDGET.maxOutputTokens,
      "governance.budget.max_output_tokens",
    ),
    maxToolCalls: positiveInteger(
      input.max_tool_calls ?? DEFAULT_BUDGET.maxToolCalls,
      "governance.budget.max_tool_calls",
    ),
    maxCostUsd:
      input.max_cost_usd === undefined || input.max_cost_usd === null
        ? null
        : positiveNumber(input.max_cost_usd, "governance.budget.max_cost_usd"),
  };
}

function policyRecord(
  value: unknown,
  path: string,
  allowedKeys?: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw policyError(path);
  const record = value as Record<string, unknown>;
  if (
    allowedKeys &&
    Object.keys(record).some((key) => !allowedKeys.includes(key))
  )
    throw policyError(path);
  return record;
}

function policyEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T))
    throw policyError(path);
  return value as T;
}

function strings(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) throw policyError(path);
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim()) throw policyError(path);
    result.push(entry);
  }
  return result;
}

function paths(value: unknown, path: string): readonly string[] {
  const result = strings(value, path);
  if (
    result.some(
      (entry) =>
        entry.startsWith("/") ||
        entry.split("/").some((part) => !part || part === ".."),
    )
  )
    throw policyError(path);
  return result;
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    throw policyError(path);
  return value;
}

function positiveNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw policyError(path);
  return value;
}

function policyError(path: string): Error {
  return new Error(`manifest ${path} is invalid`);
}
