import type {
  AskUserRequest,
  ClientToolCallRequest,
  ProposedPlan,
  RunMode,
} from "@domain/shared";
import type {
  AdmittedGovernancePolicy,
  RedactedGovernancePolicySummary,
} from "@domain/runtime/governance-policy.js";
import type {
  GovernanceEvidenceRecord,
  GovernanceEvidenceKind,
} from "@domain/runtime/governance-evidence.js";
import type {
  RuntimeGovernanceAdmission,
  RuntimeRun,
  RuntimeRunStatus,
  RuntimeSession,
} from "@application/runtime/execution/types.js";
import type { ChatMessage } from "@infrastructure/ai";
import type { DataScope } from "@infrastructure/mcp";
import type { RunContext } from "@domain/runtime/run-context.js";

export interface SessionRow {
  id: string;
  key: string;
  owner: string;
  mode: RunMode;
  history: ChatMessage[] | null;
  pending_question: AskUserRequest | null;
  pending_client_tool: ClientToolCallRequest | null;
  pending_plan: ProposedPlan | null;
  pending_approval: NonNullable<RuntimeSession["pendingApproval"]> | null;
  turns: number;
}

export interface RunRow {
  id: string;
  session_id: string;
  status: RuntimeRunStatus;
  mode: RunMode;
  input: string;
  manifest_name: string | null;
  manifest_owner: string | null;
  data_scope: DataScope | null;
  context: RunContext | null;
  trigger_source: string;
  delivery_id: string | null;
  created_at: Date | string;
  finished_at: Date | string | null;
  response_text: string;
  error: string | null;
  governance_owner?: string | null;
  governance_revision_hash?: string | null;
  governance_policy?: AdmittedGovernancePolicy["policy"] | null;
  governance_summary?: AdmittedGovernancePolicy["summary"] | null;
  governance_admitted_at?: Date | string | null;
}

export interface GovernanceEvidenceRow {
  id: string;
  run_id: string;
  owner: string;
  seq: number | bigint | string;
  kind: GovernanceEvidenceKind;
  detail: GovernanceEvidenceRecord["detail"];
  at: Date | string;
}

export function sessionFromRow(row: SessionRow): RuntimeSession {
  return {
    id: row.id,
    key: row.key,
    owner: row.owner,
    mode: row.mode,
    history: structuredClone(row.history ?? []),
    ...(row.pending_question === null
      ? {}
      : { pendingQuestion: structuredClone(row.pending_question) }),
    ...(row.pending_client_tool === null
      ? {}
      : { pendingClientTool: structuredClone(row.pending_client_tool) }),
    ...(row.pending_plan === null
      ? {}
      : { pendingPlan: structuredClone(row.pending_plan) }),
    ...(row.pending_approval === null
      ? {}
      : { pendingApproval: structuredClone(row.pending_approval) }),
    turns: Number(row.turns),
  };
}

export function runFromRow(row: RunRow): RuntimeRun {
  const governance =
    row.governance_revision_hash &&
    row.governance_owner &&
    row.governance_summary &&
    row.governance_admitted_at
      ? {
          owner: row.governance_owner,
          policyRevision: row.governance_revision_hash,
          summary: structuredClone(row.governance_summary),
          admittedAt: new Date(row.governance_admitted_at).toISOString(),
          ...(row.governance_policy == null
            ? {}
            : { policy: structuredClone(row.governance_policy) }),
        }
      : undefined;
  return {
    id: row.id,
    sessionId: row.session_id,
    status: row.status,
    mode: row.mode,
    input: row.input,
    ...(row.manifest_name == null ? {} : { manifestName: row.manifest_name }),
    ...(row.manifest_owner == null
      ? {}
      : { manifestOwner: row.manifest_owner }),
    ...(row.data_scope == null
      ? {}
      : { dataScope: structuredClone(row.data_scope) }),
    ...(row.context == null ? {} : { context: structuredClone(row.context) }),
    trigger: {
      source: row.trigger_source,
      ...(row.delivery_id == null ? {} : { deliveryId: row.delivery_id }),
    },
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.finished_at == null
      ? {}
      : { finishedAt: new Date(row.finished_at).toISOString() }),
    responseText: row.response_text,
    ...(governance === undefined ? {} : { governance }),
    ...(row.error == null ? {} : { error: row.error }),
  };
}

export function governanceAdmissionFromRow(row: {
  run_id: string;
  owner: string;
  revision_hash: string;
  policy: RedactedGovernancePolicySummary;
  admitted_at: Date | string;
}): RuntimeGovernanceAdmission {
  return {
    owner: row.owner,
    runId: row.run_id,
    policyRevision: row.revision_hash,
    policy: structuredClone(row.policy),
    admittedAt: new Date(row.admitted_at).toISOString(),
  };
}

export function governanceEvidenceFromRow(
  row: GovernanceEvidenceRow,
): GovernanceEvidenceRecord {
  return {
    id: row.id,
    owner: row.owner,
    runId: row.run_id,
    seq: Number(row.seq),
    at: row.at instanceof Date ? row.at.toISOString() : row.at,
    kind: row.kind,
    detail: structuredClone(row.detail),
  };
}

export function sessionFromPrisma(row: {
  id: string;
  key: string;
  owner: string;
  mode: string;
  history: unknown;
  pendingQuestion: unknown;
  pendingClientTool: unknown;
  pendingPlan: unknown;
  pendingApproval: unknown;
  turns: number;
}): RuntimeSession {
  return sessionFromRow({
    id: row.id,
    key: row.key,
    owner: row.owner,
    mode: row.mode as RunMode,
    history: row.history as SessionRow["history"],
    pending_question: row.pendingQuestion as SessionRow["pending_question"],
    pending_client_tool:
      row.pendingClientTool as SessionRow["pending_client_tool"],
    pending_plan: row.pendingPlan as SessionRow["pending_plan"],
    pending_approval: row.pendingApproval as SessionRow["pending_approval"],
    turns: row.turns,
  });
}

export function runFromPrisma(
  row: {
    id: string;
    sessionId: string;
    status: string;
    mode: string;
    input: string;
    manifestName: string | null;
    manifestOwner: string | null;
    dataScope: unknown;
    context: unknown;
    triggerSource: string;
    deliveryId: string | null;
    createdAt: Date;
    finishedAt: Date | null;
    responseText: string;
    error: string | null;
  },
  governance?: {
    owner: string;
    revisionHash: string;
    policy: unknown;
    summary: RedactedGovernancePolicySummary;
    admittedAt: Date;
  } | null,
): RuntimeRun {
  return runFromRow({
    id: row.id,
    session_id: row.sessionId,
    status: row.status as RuntimeRunStatus,
    mode: row.mode as RunMode,
    input: row.input,
    manifest_name: row.manifestName,
    manifest_owner: row.manifestOwner,
    data_scope: row.dataScope as RunRow["data_scope"],
    context: row.context as RunRow["context"],
    trigger_source: row.triggerSource,
    delivery_id: row.deliveryId,
    created_at: row.createdAt,
    finished_at: row.finishedAt,
    response_text: row.responseText,
    error: row.error,
    ...(governance === null || governance === undefined
      ? {}
      : {
          governance_owner: governance.owner,
          governance_revision_hash: governance.revisionHash,
          governance_policy: governance.policy as RunRow["governance_policy"],
          governance_summary: governance.summary,
          governance_admitted_at: governance.admittedAt,
        }),
  });
}
