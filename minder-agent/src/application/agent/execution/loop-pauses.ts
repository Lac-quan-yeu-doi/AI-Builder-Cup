import type { JsonValue } from "@domain/index.js";
import type { AgentLoopServices } from "./loop.js";
import type { PauseRequest } from "./pause.js";
import type { AssembledToolCall } from "./tool-dispatch.js";
import { findTool } from "./tool-dispatch.js";

export async function pauseForCall(
  call: AssembledToolCall,
  clientTools: AgentLoopServices["clientTools"],
  tools: AgentLoopServices["tools"],
  approvalGate: AgentLoopServices["approvalGate"],
): Promise<PauseRequest | undefined> {
  const existingPause =
    askUserPause(call) ??
    proposePlanPause(call) ??
    clientToolPause(call, clientTools);
  if (existingPause) return existingPause;
  const tool = findTool(call.name, tools);
  if (!tool || !approvalGate) return undefined;
  const decision = await approvalGate({ call, tool });
  return decision.kind === "pause"
    ? { kind: "approval", request: decision.request }
    : undefined;
}

export function pauseMessage(
  pending: AssembledToolCall,
  pause: PauseRequest,
): string {
  if (
    pending.id !==
    (pause.kind === "client_tool" ? pause.request.id : pending.id)
  )
    return "Not executed: the run paused. Re-issue this call if it is still correct after resume.";
  if (pause.kind === "question")
    return "Question delivered to the user. Their answer arrives as the next message.";
  if (pause.kind === "plan")
    return "Plan delivered for review. The user's response arrives as the next message.";
  if (pause.kind === "approval")
    return "Tool approval requested. The run resumes after the approval decision arrives.";
  return "Client tool request delivered. Its result arrives as the next tool message.";
}

function askUserPause(call: AssembledToolCall): PauseRequest | undefined {
  if (!isRecord(call.arguments)) return undefined;
  const question =
    typeof call.arguments.question === "string"
      ? call.arguments.question
      : undefined;
  if (!question) return undefined;
  const options = Array.isArray(call.arguments.options)
    ? call.arguments.options.flatMap((option) => {
        if (typeof option === "string") return [{ label: option }];
        if (isRecord(option) && typeof option.label === "string")
          return [{ label: option.label }];
        return [];
      })
    : [];
  return {
    kind: "question",
    request: {
      version: 1,
      kind: options.length > 0 ? "choice" : "free_text",
      question,
      options,
      allowOther: call.arguments.allow_other === true,
    },
  };
}

function proposePlanPause(call: AssembledToolCall): PauseRequest | undefined {
  if (call.name !== "ProposePlan" || !isRecord(call.arguments))
    return undefined;
  const summary = call.arguments.summary;
  if (summary !== undefined && typeof summary !== "string") return undefined;
  const steps = call.arguments.steps;
  if (!Array.isArray(steps) || steps.length === 0) return undefined;
  const normalized = steps.flatMap((step) => {
    if (!isRecord(step)) return [];
    const toolName = step.tool_name;
    const rationale = step.rationale;
    if (
      typeof toolName !== "string" ||
      !toolName.trim() ||
      typeof rationale !== "string" ||
      !rationale.trim() ||
      !("arguments" in step)
    )
      return [];
    return [{ toolName, arguments: step.arguments!, rationale }];
  });
  if (normalized.length !== steps.length) return undefined;
  return {
    kind: "plan",
    request: {
      ...(typeof summary === "string" && summary.trim() ? { summary } : {}),
      steps: normalized,
    },
  };
}

function clientToolPause(
  call: AssembledToolCall,
  clientTools: AgentLoopServices["clientTools"],
): PauseRequest | undefined {
  if (!clientTools?.some((tool) => tool.name === call.name)) return undefined;
  return {
    kind: "client_tool",
    request: { id: call.id, name: call.name, arguments: call.arguments },
  };
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
