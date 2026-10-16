import type { JsonObject } from "@domain/index.js";

export interface GovernancePolicy {
  readonly actionApprovals: Readonly<Record<string, boolean>>;
  /** Actions that may run without an interactive approval pause. */
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

export interface GovernancePolicyInput {
  readonly actionApprovals?: Readonly<Record<string, boolean>>;
  readonly autoApprovals?: readonly string[];
  readonly autonomy?: GovernancePolicy["autonomy"];
  readonly sandbox?: Partial<GovernancePolicy["sandbox"]>;
  readonly sensitiveFiles?: GovernancePolicy["sensitiveFiles"];
  readonly budget?: Partial<GovernancePolicy["budget"]>;
}

export interface GovernanceManifest {
  readonly owner: string;
  readonly governance?: GovernancePolicyInput;
}

/** Owner-scoped runtime fields resolved from an agent manifest. */
export interface RuntimeManifest extends GovernanceManifest {
  readonly manifestHash?: string;
  readonly manifestSourcePath?: string;
  readonly manifestYaml?: string;
  readonly skills?: readonly string[];
  readonly systemPrompt?: string;
  readonly model?: {
    readonly provider?: string;
    readonly name?: string;
    readonly temperature?: number;
    readonly maxTokens?: number;
  };
  readonly tools?: {
    readonly mode: "allowlist" | "denylist" | "all";
    readonly names: readonly string[];
  };
  readonly execution?: {
    readonly mode?: "autonomous" | "interactive";
    readonly maxIterations?: number;
    readonly planReview?: boolean;
    readonly interruptOnCost?: number;
  };
  readonly workingDirectory?: string;
  readonly clientTools?: readonly {
    readonly name: string;
    readonly description: string;
    readonly parameters: JsonObject;
  }[];
}

export type RuntimeGovernanceDefaults = GovernancePolicyInput;

export interface RedactedGovernancePolicySummary {
  readonly actionApprovals: Readonly<Record<string, boolean>>;
  readonly autoApprovals: readonly string[];
  readonly autonomy: GovernancePolicy["autonomy"];
  readonly sandbox: {
    readonly enabled: boolean;
    readonly allowedCommandCount: number;
    readonly writablePathCount: number;
  };
  readonly sensitiveFiles: GovernancePolicy["sensitiveFiles"];
  readonly budget: GovernancePolicy["budget"];
}

export interface ResolvedGovernancePolicy {
  readonly owner: string;
  readonly policy: GovernancePolicy;
  readonly policyRevision: string;
  readonly summary: RedactedGovernancePolicySummary;
}

export interface AdmittedGovernancePolicy extends Omit<
  ResolvedGovernancePolicy,
  "policy"
> {
  /** Full policy is available only in the live admission process; persistence stores summary counts. */
  readonly policy?: GovernancePolicy;
  readonly admittedAt: string;
}

export const DEFAULT_RUNTIME_GOVERNANCE_POLICY: GovernancePolicy = {
  actionApprovals: {},
  // Interactive tool approvals are opt-in by default. A manifest can restore
  // approval prompts by supplying its own auto_approvals list and/or action
  // approvals.
  autoApprovals: ["*"],
  autonomy: "manual",
  sandbox: { enabled: false, allowedCommands: [], writablePaths: [] },
  sensitiveFiles: "deny",
  budget: {
    maxInputTokens: 128000,
    maxOutputTokens: 16384,
    maxToolCalls: 50,
    maxCostUsd: null,
  },
};

export function resolveGovernancePolicy(input: {
  readonly owner: string;
  readonly manifest?: GovernanceManifest;
  readonly runtimeDefaults?: RuntimeGovernanceDefaults;
  readonly sha256: (value: string) => string;
}): ResolvedGovernancePolicy {
  const defaults = mergeGovernancePolicy(
    DEFAULT_RUNTIME_GOVERNANCE_POLICY,
    input.runtimeDefaults,
  );
  const policy =
    input.manifest?.owner === input.owner
      ? mergeGovernancePolicy(defaults, input.manifest.governance)
      : defaults;
  return {
    owner: input.owner,
    policy,
    policyRevision: policyRevision(policy, input.sha256),
    summary: redactedGovernancePolicySummary(policy),
  };
}

export function canonicalGovernancePolicy(policy: GovernancePolicy): string {
  return JSON.stringify({
    actionApprovals: sortedRecord(policy.actionApprovals),
    autoApprovals: sortedStrings(policy.autoApprovals ?? []),
    autonomy: policy.autonomy,
    sandbox: {
      enabled: policy.sandbox.enabled,
      allowedCommands: [...policy.sandbox.allowedCommands].sort(),
      writablePaths: [...policy.sandbox.writablePaths].sort(),
    },
    sensitiveFiles: policy.sensitiveFiles,
    budget: {
      maxInputTokens: policy.budget.maxInputTokens,
      maxOutputTokens: policy.budget.maxOutputTokens,
      maxToolCalls: policy.budget.maxToolCalls,
      maxCostUsd: policy.budget.maxCostUsd,
    },
  });
}

export function policyRevision(
  policy: GovernancePolicy,
  sha256: (value: string) => string,
): string {
  return sha256(canonicalGovernancePolicy(policy));
}

export function redactedGovernancePolicySummary(
  policy: GovernancePolicy,
): RedactedGovernancePolicySummary {
  return {
    actionApprovals: sortedRecord(policy.actionApprovals),
    autoApprovals: sortedStrings(policy.autoApprovals ?? []),
    autonomy: policy.autonomy,
    sandbox: {
      enabled: policy.sandbox.enabled,
      allowedCommandCount: policy.sandbox.allowedCommands.length,
      writablePathCount: policy.sandbox.writablePaths.length,
    },
    sensitiveFiles: policy.sensitiveFiles,
    budget: { ...policy.budget },
  };
}

export function admitGovernancePolicy(
  resolved: ResolvedGovernancePolicy,
  admittedAt: string,
): AdmittedGovernancePolicy {
  return {
    ...resolved,
    policy: structuredClone(resolved.policy),
    summary: structuredClone(resolved.summary),
    admittedAt,
  };
}

function mergeGovernancePolicy(
  base: GovernancePolicy,
  override: GovernancePolicyInput | undefined,
): GovernancePolicy {
  return {
    actionApprovals: {
      ...base.actionApprovals,
      ...override?.actionApprovals,
    },
    autoApprovals:
      override?.autoApprovals === undefined
        ? [...(base.autoApprovals ?? [])]
        : [...override.autoApprovals],
    autonomy: override?.autonomy ?? base.autonomy,
    sandbox: {
      enabled: override?.sandbox?.enabled ?? base.sandbox.enabled,
      allowedCommands: [
        ...(override?.sandbox?.allowedCommands ?? base.sandbox.allowedCommands),
      ],
      writablePaths: [
        ...(override?.sandbox?.writablePaths ?? base.sandbox.writablePaths),
      ],
    },
    sensitiveFiles: override?.sensitiveFiles ?? base.sensitiveFiles,
    budget: {
      maxInputTokens:
        override?.budget?.maxInputTokens ?? base.budget.maxInputTokens,
      maxOutputTokens:
        override?.budget?.maxOutputTokens ?? base.budget.maxOutputTokens,
      maxToolCalls: override?.budget?.maxToolCalls ?? base.budget.maxToolCalls,
      maxCostUsd:
        override?.budget?.maxCostUsd === undefined
          ? base.budget.maxCostUsd
          : override.budget.maxCostUsd,
    },
  };
}

function sortedRecord(
  value: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

function sortedStrings(value: readonly string[]): readonly string[] {
  return [...value].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}
