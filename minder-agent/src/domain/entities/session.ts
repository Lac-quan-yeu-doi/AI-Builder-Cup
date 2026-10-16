import type { CallerId, SessionId } from "../values/ids.js";
import type {
  AppStateVariable,
  AskUserRequest,
  ClientToolCallRequest,
  JsonValue,
  ProposedPlan,
  RunMode,
} from "./run.js";

export interface Session {
  readonly id: SessionId;
  readonly key?: string;
  readonly owner: CallerId;
  readonly mode: RunMode;
  readonly history: readonly JsonValue[];
  readonly pendingQuestion?: AskUserRequest;
  readonly pendingClientTool?: ClientToolCallRequest;
  readonly pendingPlan?: ProposedPlan;
  readonly applicationState: Readonly<Record<string, AppStateVariable>>;
  readonly turns: number;
}

export interface SessionTurnInput {
  readonly history: readonly JsonValue[];
  readonly pendingQuestion?: AskUserRequest;
  readonly pendingClientTool?: ClientToolCallRequest;
  readonly pendingPlan?: ProposedPlan;
}

export type SessionTurn = SessionTurnInput;

export function createSessionTurn(input: SessionTurnInput): SessionTurn {
  const pending = [
    input.pendingQuestion,
    input.pendingClientTool,
    input.pendingPlan,
  ].filter((value) => value !== undefined).length;
  if (pending > 1)
    throw new Error("A session turn may contain at most one pending pause");
  return input;
}
