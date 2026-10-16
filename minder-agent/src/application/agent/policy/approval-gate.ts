import type { ToolPort } from "@application/shared/ports/index.js";
import type { AssembledToolCall } from "../execution/tool-dispatch.js";

export interface ToolApprovalRequest {
  readonly approvalId: string;
  readonly toolCallId: string;
  readonly action: string;
  readonly argumentsHash: string;
  readonly preview: string;
  readonly expiresAt: string;
}

export type ToolApprovalGate = (input: {
  readonly call: AssembledToolCall;
  readonly tool: ToolPort;
}) => Promise<
  | { readonly kind: "allow" }
  | { readonly kind: "pause"; readonly request: ToolApprovalRequest }
>;
