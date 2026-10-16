export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface AskUserRequest {
  version: 1;
  kind: "free_text" | "choice";
  question: string;
  options: QuestionOption[];
  allow_other: boolean;
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

export interface DoneEventData {
  readonly response_text: string;
}

export type WorkspaceChangeKind = "created" | "modified" | "deleted";

export interface WorkspaceChange {
  readonly rel_path: string;
  readonly kind: WorkspaceChangeKind;
}

export type RunMode = "autonomous" | "interactive";

export type AgentEvent =
  | { type: "reasoning"; data: string }
  | { type: "text"; data: string }
  | {
      type: "tool_started";
      data: { id: string; name: string; arguments: JsonObject };
    }
  | {
      type: "tool_finished";
      data: { id: string; name: string; success: boolean };
    }
  | {
      type: "tool_result";
      data: {
        id: string;
        name: string;
        is_error: boolean;
        content: string;
        metadata?: JsonObject;
      };
    }
  | {
      type: "tool_progress";
      data: { id: string; kind: string; payload: JsonValue };
    }
  | { type: "workspace_changed"; data: { changes: readonly WorkspaceChange[] } }
  | { type: "token_usage"; data: { input: number; output: number } }
  | { type: "context_usage"; data: number }
  | { type: "awaiting_input"; data: AskUserRequest }
  | { type: "awaiting_client_tool"; data: ClientToolCallRequest }
  | { type: "awaiting_plan"; data: ProposedPlan }
  | {
      type: "awaiting_approval";
      data: {
        approval_id: string;
        action: string;
        preview: string;
        expires_at: string;
      };
    }
  | { type: "done"; data: DoneEventData | null };

export type RunStatus = "completed" | "failed" | "interrupted" | "backgrounded";

export type RunErrorCode =
  | "invalid_input"
  | "configuration"
  | "transport"
  | "provider"
  | "stream"
  | "interrupted";

export interface RunError {
  code: RunErrorCode;
  message: string;
}

export interface RunOutcome {
  status: RunStatus;
  text: string;
  error?: RunError;
  /** Internal durable continuation state; never emitted as a public SSE event. */
  loopSnapshot?: JsonValue;
}
