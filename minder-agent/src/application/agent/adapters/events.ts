import type { AgentLifecycleEvent } from "@application/agent";
import type { AgentEvent, JsonValue, RunOutcome } from "@domain/shared";

/**
 * Translate a loop lifecycle event to the public `AgentEvent`s the runtime
 * broadcasts. Only terminal events carry a client-visible signal in v1; the
 * intermediate control events (`iteration`, `model_started`, etc.) are internal.
 */
export function lifecycleToAgentEvents(
  event: AgentLifecycleEvent,
): readonly AgentEvent[] {
  switch (event.type) {
    case "completed":
    case "failed":
    case "paused":
      return [
        {
          type: "done",
          data: { response_text: outcomeToRunOutcome(event.data).text },
        },
      ];
    default:
      return [];
  }
}

/**
 * Read the terminal `AgentLoopOutcome` carried on a terminal lifecycle event's
 * `data` and map it to the runtime `RunOutcome`.
 */
export function outcomeToRunOutcome(data: JsonValue): RunOutcome {
  const outcome = (
    data as { outcome?: { kind?: string; text?: string; error?: string } }
  ).outcome;
  if (!outcome) {
    return {
      status: "failed",
      text: "",
      error: { code: "transport", message: "missing outcome" },
    };
  }
  if (outcome.kind === "completed") {
    return { status: "completed", text: outcome.text ?? "" };
  }
  if (outcome.kind === "interrupted") {
    return {
      status: "interrupted",
      text: outcome.text ?? "",
      error: { code: "interrupted", message: "Run interrupted." },
    };
  }
  return {
    status: "failed",
    text: outcome.text ?? "",
    error: { code: "transport", message: outcome.error ?? "Run failed." },
  };
}
