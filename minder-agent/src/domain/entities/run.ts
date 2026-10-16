import type { AgentId, RoomId, RunId, SessionId } from "../values/ids.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type RunMode = "interactive" | "autonomous";
export const parseRunMode = (value: string): RunMode =>
  value === "interactive" ? "interactive" : "autonomous";

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "awaiting_input"
  | "awaiting_client_tool"
  | "awaiting_plan_confirmation"
  | "awaiting_children"
  | "interrupted"
  | "failed";

export const isActiveRunStatus = (status: RunStatus): boolean =>
  status === "queued" || status === "running" || status === "awaiting_children";
export const isTerminalRunStatus = (status: RunStatus): boolean =>
  !isActiveRunStatus(status);

export interface QuestionOption {
  readonly label: string;
  readonly description?: string;
}
export interface AskUserRequest {
  readonly version: number;
  readonly kind: "free_text" | "choice";
  readonly question: string;
  readonly options: readonly QuestionOption[];
  readonly allowOther: boolean;
}
export interface ClientToolCallRequest {
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonValue;
}
export interface ProposedPlanStep {
  readonly toolName: string;
  readonly arguments: JsonValue;
  readonly rationale: string;
}
export interface ProposedPlan {
  readonly summary?: string;
  readonly steps: readonly ProposedPlanStep[];
}
export interface AppStateVariable {
  readonly value: JsonValue;
  readonly visible: boolean;
}
export interface Trigger {
  readonly source: string;
  readonly deliveryId?: string;
}
export interface Run {
  readonly id: RunId;
  readonly sessionId?: SessionId;
  readonly roomId?: RoomId;
  readonly agentId?: AgentId;
  readonly parentRunId?: RunId;
  readonly status: RunStatus;
  readonly mode: RunMode;
  readonly trigger: Trigger;
  readonly input: string;
  readonly depth: number;
  readonly createdAt: string;
  readonly finishedAt?: string;
  readonly error?: string;
}
export interface EventEnvelope {
  readonly runId: RunId;
  readonly seq: number;
  readonly payload: JsonValue;
}
