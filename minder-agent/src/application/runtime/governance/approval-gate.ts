import type { ToolApprovalGate } from "@application/agent";
import type { JsonValue } from "@domain/shared";
import type { ApprovalService } from "./approvals.js";
import type { Sha256 } from "@application/shared/ports/index.js";

const APPROVAL_TTL_MS = 5 * 60 * 1000;

export interface RuntimeApprovalGateOptions {
  readonly owner: string;
  readonly runId: string;
  readonly approvalService: ApprovalService;
  readonly sha256: Sha256;
  /** Converts tool arguments into an approval-safe preview. */
  readonly redactor: (arguments_: JsonValue) => string;
  readonly autoApprovals?: readonly string[];
  readonly actionApprovals?: Readonly<Record<string, boolean>>;
  readonly now?: () => string;
}

/**
 * Creates the runtime-owned approval gate. Tool arguments only flow through
 * the redactor and SHA-256 here; durable approval state retains neither raw
 * arguments nor an unredacted preview.
 */
export function createRuntimeApprovalGate(
  options: RuntimeApprovalGateOptions,
): ToolApprovalGate {
  const now = options.now ?? (() => new Date().toISOString());
  return async ({ call, tool }) => {
    const actionRequiresApproval =
      options.actionApprovals?.[tool.descriptor.name] === true;
    if (
      !actionRequiresApproval &&
      (tool.descriptor.readOnly ||
        options.autoApprovals?.includes(tool.descriptor.name) ||
        options.autoApprovals?.includes("*"))
    )
      return { kind: "allow" };
    const argumentsHash = hashToolArguments(call.arguments, options.sha256);
    const preview = options.redactor(call.arguments);
    const createdAt = now();
    const approval = await options.approvalService.request({
      owner: options.owner,
      runId: options.runId,
      toolCallId: call.id,
      action: tool.descriptor.name,
      argumentsHash,
      preview,
      expiresAt: new Date(
        new Date(createdAt).getTime() + APPROVAL_TTL_MS,
      ).toISOString(),
    });
    return {
      kind: "pause",
      request: {
        approvalId: approval.id,
        toolCallId: approval.toolCallId,
        action: approval.action,
        argumentsHash: approval.argumentsHash,
        preview: approval.preview,
        expiresAt: approval.expiresAt,
      },
    };
  };
}

export function hashToolArguments(value: JsonValue, sha256: Sha256): string {
  return `sha256:${sha256(stableStringify(value))}`;
}

function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, JsonValue>;
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${stableStringify(record[key] ?? null)}`,
    )
    .join(",")}}`;
}
