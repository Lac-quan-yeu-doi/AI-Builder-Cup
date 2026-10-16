import type {
  AskUserRequest,
  ClientToolCallRequest,
  ProposedPlan,
} from "@domain/index.js";
import type { ToolApprovalRequest } from "../policy/approval-gate.js";
export type PauseRequest =
  | { readonly kind: "question"; readonly request: AskUserRequest }
  | { readonly kind: "client_tool"; readonly request: ClientToolCallRequest }
  | { readonly kind: "plan"; readonly request: ProposedPlan }
  | { readonly kind: "approval"; readonly request: ToolApprovalRequest };
