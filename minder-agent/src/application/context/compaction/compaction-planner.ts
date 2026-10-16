export type CompactionAction =
  "none" | "warn" | "mask" | "prune" | "aggressive" | "compact";

export interface CompactionMessage {
  readonly id: string;
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly pendingPause?: boolean;
  readonly toolCallId?: string;
}

export interface PlannedCompaction {
  readonly action: CompactionAction;
  readonly reason: string;
  readonly retained: readonly CompactionMessage[];
}

export function planCompaction(input: {
  readonly messages: readonly CompactionMessage[];
  readonly usagePercent: number;
}): PlannedCompaction {
  const usagePercent = Math.max(0, Math.min(100, input.usagePercent));
  const action: CompactionAction =
    usagePercent >= 99
      ? "compact"
      : usagePercent >= 90
        ? "aggressive"
        : usagePercent >= 85
          ? "prune"
          : usagePercent >= 80
            ? "mask"
            : usagePercent >= 70
              ? "warn"
              : "none";
  if (action === "none" || action === "warn" || action === "mask") {
    return {
      action,
      reason: `context usage is ${usagePercent}%`,
      retained: input.messages,
    };
  }
  const protectedToolCalls = new Set(
    input.messages.flatMap((message) =>
      message.toolCallId ? [message.toolCallId] : [],
    ),
  );
  const retained = input.messages.filter(
    (message, index) =>
      message.role === "system" ||
      message.pendingPause === true ||
      (message.toolCallId !== undefined &&
        protectedToolCalls.has(message.toolCallId)) ||
      index >= input.messages.length - 1,
  );
  return {
    action,
    reason: `context usage is ${usagePercent}%; ${action} compaction is required`,
    retained,
  };
}
