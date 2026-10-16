import type { JsonObject, JsonValue } from "@domain/shared";

export type { JsonObject, JsonPrimitive, JsonValue } from "@domain/shared";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonObject;
  };
}

export interface AssistantToolCall {
  id: string;
  name: string;
  arguments: string;
  extraContent?: JsonValue;
}

/** OpenAI-compatible assistant tool-call shape used in outbound chat history. */
export interface ChatToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
  extra_content?: JsonValue;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string;
      tool_calls?: readonly ChatToolCall[];
    }
  | {
      role: "tool";
      name?: string;
      tool_call_id: string;
      content: string;
    };

export interface ChatCompletionRequest {
  model: string;
  messages: readonly ChatMessage[];
  tools?: readonly ToolDefinition[];
  tool_choice?: "auto";
  stream: true;
  temperature?: number;
  max_tokens?: number;
}

export type ModelStreamEvent =
  | { type: "reasoning"; text: string }
  | { type: "text"; text: string }
  | { type: "tool_call"; call: AssistantToolCall }
  | {
      type: "finish";
      reason: "stop" | "length" | "tool_calls" | "content_filter" | "unknown";
    }
  | { type: "usage"; input: number; output: number };

export interface ChatCompletionGateway {
  stream(
    request: ChatCompletionRequest,
    signal: AbortSignal,
  ): AsyncIterable<ModelStreamEvent>;
}
