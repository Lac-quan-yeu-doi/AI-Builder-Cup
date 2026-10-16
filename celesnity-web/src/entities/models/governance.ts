export interface GovernancePolicySummary {
  readonly actionApprovals: Readonly<Record<string, boolean>>;
  readonly autoApprovals?: readonly string[];
  readonly autonomy: 'manual' | 'safe' | 'supervised';
  readonly sandbox: {
    readonly enabled: boolean;
    readonly allowedCommandCount: number;
    readonly writablePathCount: number;
  };
  readonly sensitiveFiles: 'deny' | 'allow_templates';
  readonly budget: {
    readonly maxInputTokens: number;
    readonly maxOutputTokens: number;
    readonly maxToolCalls: number;
    readonly maxCostUsd: number | null;
  };
}

export interface ManifestGovernance {
  readonly policyRevision: string;
  readonly admittedAt: string;
  readonly policy: GovernancePolicySummary;
}

export interface RunGovernance extends ManifestGovernance {
  readonly owner: string;
  readonly runId: string;
  readonly dataScope?: { readonly catalog?: string; readonly schema: string } | null;
}

export type GovernanceEvidenceKind =
  | 'admission'
  | 'tool_decision'
  | 'approval_requested'
  | 'approval_decided'
  | 'recovery'
  | 'redaction'
  | 'budget_exhausted'
  | 'mcp_discovery'
  | 'mcp_call'
  | 'mcp_reconnect';

export interface GovernanceEvidence {
  readonly id: string;
  readonly owner: string;
  readonly runId: string;
  readonly seq: number;
  readonly at: string;
  readonly kind: GovernanceEvidenceKind;
  readonly detail: Record<string, unknown>;
}

export interface GovernanceEvidencePage {
  readonly items: readonly GovernanceEvidence[];
  readonly nextCursor?: string;
}
