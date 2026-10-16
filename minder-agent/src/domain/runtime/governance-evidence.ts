import type {
  GovernanceDecision,
  GovernanceUsage,
} from "./governance-enforcer.js";
import type { RedactedGovernancePolicySummary } from "./governance-policy.js";

export type GovernanceEvidenceKind =
  | "admission"
  | "tool_decision"
  | "approval_requested"
  | "approval_decided"
  | "recovery"
  | "redaction"
  | "budget_exhausted"
  | "mcp_discovery"
  | "mcp_call"
  | "mcp_reconnect"
  | "action_summary";

export type GovernanceEvidenceDetail =
  | {
      readonly policyRevision: string;
      readonly summary: RedactedGovernancePolicySummary;
    }
  | {
      readonly action: string;
      readonly decision: GovernanceDecision["kind"];
      readonly code?: Extract<
        GovernanceDecision,
        { readonly kind: "deny" }
      >["code"];
      readonly reason?: string;
      readonly readOnly: boolean;
      readonly usage: GovernanceUsage;
    }
  | {
      readonly approvalId: string;
      readonly toolCallId: string;
      readonly action: string;
      readonly expiresAt: string;
    }
  | {
      readonly approvalId: string;
      readonly status:
        | "approved"
        | "denied"
        | "expired"
        | "hash_mismatch"
        | "execution_ambiguous";
    }
  | { readonly phase: "startup_recovery"; readonly reason: string }
  | { readonly fields: readonly string[]; readonly reason: string }
  | {
      readonly server: string;
      readonly agent: string;
      readonly toolCount: number;
    }
  | {
      readonly server: string;
      readonly agent: string;
      readonly tool: string;
      readonly status: "succeeded" | "denied" | "failed";
      readonly code?: string;
    }
  | {
      readonly server: string;
      readonly agent: string;
      readonly status: "succeeded" | "failed";
    }
  | {
      readonly tool: string;
      readonly status: "success" | "error";
      readonly readOnly: boolean;
      readonly destructive: boolean;
      readonly argumentKeys: readonly string[];
      readonly resultSize: number;
      readonly durationMs?: number;
    }
  | { readonly reason: string; readonly usage: GovernanceUsage };

export interface GovernanceEvidenceRecord {
  readonly id: string;
  readonly owner: string;
  readonly runId: string;
  readonly seq: number;
  readonly at: string;
  readonly kind: GovernanceEvidenceKind;
  readonly detail: GovernanceEvidenceDetail;
}

export type GovernanceEvidenceInput = Omit<
  GovernanceEvidenceRecord,
  "id" | "seq" | "owner"
>;

export interface GovernanceEvidencePage {
  readonly items: readonly GovernanceEvidenceRecord[];
  readonly nextCursor?: string;
}

export function decisionEvidence(input: {
  readonly action: string;
  readonly readOnly: boolean;
  readonly decision: GovernanceDecision;
  readonly usage: GovernanceUsage;
}): GovernanceEvidenceDetail {
  return {
    action: input.action,
    decision: input.decision.kind,
    ...(input.decision.kind === "deny" ? { code: input.decision.code } : {}),
    ...(input.decision.kind === "allow"
      ? {}
      : { reason: input.decision.reason }),
    readOnly: input.readOnly,
    usage: { ...input.usage },
  };
}
