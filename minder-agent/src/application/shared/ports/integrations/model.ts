import type { JsonObject, JsonValue } from "@domain/index.js";
export interface ModelToolCallRef {
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonValue;
  /** Exact provider payload retained for validation and truncation recovery. */
  readonly rawArguments?: string;
  /** Parsed provider payload when parsing was possible without recovery. */
  readonly parsedArguments?: JsonValue;
  /** Opaque provider metadata that must survive multi-turn history. */
  readonly extraContent?: JsonValue;
}

/** A provider stream fragment for a single indexed tool call. */
export interface ModelToolCallDelta {
  readonly index: number;
  readonly id?: string;
  readonly name?: string;
  /** Raw JSON text fragment. It must be concatenated before parsing. */
  readonly argumentsText?: string;
  /** Opaque provider metadata emitted alongside the tool call. */
  readonly extraContent?: JsonValue;
}
export interface ModelMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  /** Present on assistant messages that issued tool calls. */
  readonly toolCalls?: readonly ModelToolCallRef[];
  /** Present on tool-result messages: the id of the call they answer. */
  readonly toolCallId?: string;
}
export interface ModelRequest {
  readonly model: string;
  readonly messages: readonly ModelMessage[];
  readonly tools?: readonly ModelToolDefinition[];
  readonly temperature?: number;
  readonly maxTokens?: number;
}
export interface ModelToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonObject;
}
export interface ModelDelta {
  readonly text?: string;
  readonly reasoning?: string;
  readonly toolCall?: {
    readonly id: string;
    readonly name: string;
    readonly arguments: JsonValue;
    /** Exact provider payload retained for validation and truncation recovery. */
    readonly rawArguments?: string;
    readonly extraContent?: JsonValue;
  };
  /**
   * Incremental tool-call data. Consumers must retain the raw fragments until
   * the provider turn finishes; `toolCall` remains for non-streaming adapters.
   */
  readonly toolCallDelta?: ModelToolCallDelta;
  readonly usage?: { readonly input: number; readonly output: number };
  readonly finishReason?:
    "stop" | "length" | "tool_calls" | "content_filter" | "unknown";
}
export interface ModelPort {
  stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelDelta>;
}
