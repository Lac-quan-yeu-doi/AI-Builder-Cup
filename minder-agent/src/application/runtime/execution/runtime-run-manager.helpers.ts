import type { JsonObject, JsonValue } from "@domain/shared";
import type { GovernanceEvidencePage } from "@domain/runtime/governance-evidence.js";
import type { GovernanceUsage } from "@domain/runtime/governance-enforcer.js";
import type { MaybePromise, RuntimeLoopSnapshot } from "./types.js";

export function latestGovernanceUsage(
  evidence: GovernanceEvidencePage,
): GovernanceUsage | undefined {
  for (const record of [...evidence.items].reverse()) {
    if ("usage" in record.detail) return record.detail.usage;
  }
  return undefined;
}

export function thenMaybe<T, U>(
  value: MaybePromise<T>,
  next: (value: T) => MaybePromise<U>,
): MaybePromise<U> {
  return value instanceof Promise ? value.then(next) : next(value);
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export interface SnapshotToolCall {
  readonly name: string;
  readonly arguments: JsonObject;
}

export function snapshotToolCall(
  snapshot: RuntimeLoopSnapshot,
  toolCallId: string,
): SnapshotToolCall | undefined {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.messages))
    return undefined;
  for (const message of snapshot.messages) {
    if (
      !isRecord(message) ||
      message.role !== "assistant" ||
      !Array.isArray(message.toolCalls)
    )
      continue;
    for (const call of message.toolCalls) {
      if (
        !isRecord(call) ||
        call.id !== toolCallId ||
        typeof call.name !== "string"
      )
        continue;
      if (!isJsonObject(call.arguments)) return undefined;
      return { name: call.name, arguments: call.arguments };
    }
  }
  return undefined;
}

export function planToolCallId(
  snapshot: RuntimeLoopSnapshot,
): string | undefined {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.messages))
    return undefined;
  for (const message of snapshot.messages) {
    if (
      !isRecord(message) ||
      message.role !== "assistant" ||
      !Array.isArray(message.toolCalls)
    )
      continue;
    const calls = message.toolCalls as readonly JsonValue[];
    const call = calls.find(
      (candidate): candidate is JsonObject =>
        isRecord(candidate) &&
        candidate.name === "ProposePlan" &&
        typeof candidate.id === "string",
    );
    if (call && typeof call.id === "string") return call.id;
  }
  return undefined;
}

export function approvalResolutionMessage(
  status: "denied" | "expired" | "hash_mismatch",
): string {
  if (status === "denied") return "Tool approval was denied.";
  if (status === "expired") return "Tool approval expired before execution.";
  return "Tool approval could not be verified and was not executed.";
}

export function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
