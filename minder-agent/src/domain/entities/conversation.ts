import type { JsonObject, JsonValue } from "./run.js";

export type MessageRole = "user" | "assistant" | "system";
export type ProvenanceKind =
  "external_user" | "inter_session" | "internal_system";
export interface InputProvenance {
  readonly kind: ProvenanceKind;
  readonly sourceChannel?: string;
  readonly sourceSessionId?: string;
  readonly timestamp: string;
}
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly parameters: JsonObject;
  readonly result?: JsonValue;
  readonly resultSummary?: string;
  readonly timestamp: string;
  readonly approved: boolean;
  readonly error?: string;
  readonly nestedToolCalls: readonly ToolCall[];
}
export interface ChatMessage {
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: string;
  readonly metadata: JsonObject;
  readonly toolCalls: readonly ToolCall[];
  readonly tokens?: number;
  readonly thinkingTrace?: string;
  readonly reasoningContent?: string;
  readonly tokenUsage?: JsonObject;
  readonly provenance?: InputProvenance;
}
export const isSystemInjectedContent = (content: string): boolean =>
  content.startsWith("[SYSTEM] ") || content.startsWith("<system-reminder>");
