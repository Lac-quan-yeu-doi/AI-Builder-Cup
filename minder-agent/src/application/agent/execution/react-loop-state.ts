import type { ModelMessage } from "@application/shared/ports/index.js";
import type { LoopBackgroundTask, LoopTodo } from "../context/context.js";
import type { PauseRequest } from "./pause.js";

/** JSON-safe durable state for a resumable ReAct loop. */
export interface LoopSnapshot {
  readonly version: 1;
  readonly iteration: number;
  readonly messages: readonly ModelMessage[];
  readonly activatedTools?: readonly string[];
  readonly continuationQueue?: readonly string[];
  readonly pendingPause?: PauseRequest;
  readonly todos?: readonly LoopTodo[];
  readonly backgroundTasks?: readonly LoopBackgroundTask[];
  readonly reminderCadence?: number;
}

/** A verified result that replaces the tool result held while a run paused. */
export interface LoopToolResultReplacement {
  readonly toolCallId: string;
  readonly content: string;
  readonly isError: boolean;
}

/** The durable inputs required to continue a paused run without a new user turn. */
export interface LoopContinuation {
  readonly snapshot: LoopSnapshot;
  readonly toolResult: LoopToolResultReplacement;
}

/**
 * Replace the placeholder result for an approved call or plan while retaining
 * the original assistant tool-call message and its call ID for the provider.
 */
export function continueLoopSnapshot({
  snapshot,
  toolResult,
}: LoopContinuation): LoopSnapshot {
  const pending = snapshot.pendingPause;
  const matchesPause =
    pending?.kind === "approval"
      ? pending.request.toolCallId === toolResult.toolCallId
      : pending?.kind === "plan";
  if (!matchesPause)
    throw new Error("Continuation does not match the paused tool call.");
  if (
    !snapshot.messages.some(
      (message) =>
        message.role === "assistant" &&
        message.toolCalls?.some((call) => call.id === toolResult.toolCallId),
    )
  ) {
    throw new Error("Continuation is missing its original tool call.");
  }

  let replacements = 0;
  const messages = snapshot.messages.map((message) => {
    if (message.role !== "tool" || message.toolCallId !== toolResult.toolCallId)
      return structuredClone(message);
    replacements += 1;
    return {
      ...structuredClone(message),
      content: toolResult.content,
    };
  });
  if (replacements !== 1)
    throw new Error("Continuation is missing its paused tool result.");

  const resumedSnapshot = { ...structuredClone(snapshot) };
  delete resumedSnapshot.pendingPause;
  return { ...resumedSnapshot, messages };
}

/**
 * Ensure every historical assistant tool call has a corresponding tool result.
 * Provider APIs reject such incomplete transcripts on resume, so missing calls
 * are closed with a durable skipped result instead of being silently dropped.
 */
export function repairTranscript(
  messages: readonly ModelMessage[],
): readonly ModelMessage[] {
  const repaired = structuredClone(messages) as ModelMessage[];
  const unmatched = new Map<string, string>();
  for (const message of repaired) {
    if (message.role === "assistant") {
      for (const call of message.toolCalls ?? [])
        unmatched.set(call.id, call.name);
    }
    if (message.role === "tool" && message.toolCallId)
      unmatched.delete(message.toolCallId);
  }
  for (const [id, name] of unmatched) {
    repaired.push({
      role: "tool",
      toolCallId: id,
      content: `Not executed: historical tool call ${name || id} was incomplete when this run resumed.`,
    });
  }
  return repaired;
}
