import type {
  AssistantToolCall,
  ChatCompletionGateway,
  ChatCompletionRequest,
  JsonValue,
  ModelStreamEvent,
} from "@infrastructure/ai";
import { parseSse } from "./sse.js";
import { adaptToolDefinitionsForProvider } from "./provider-adapter.js";

export type ProviderErrorCode = "transport" | "provider" | "stream";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
  }
}

export interface OpenAiCompatibleGatewayOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider?: string;
  fetch?: typeof fetch;
}

export class OpenAiCompatibleGateway implements ChatCompletionGateway {
  constructor(private readonly config: OpenAiCompatibleGatewayOptions) {}

  async *stream(
    request: ChatCompletionRequest,
    signal: AbortSignal,
  ): AsyncGenerator<ModelStreamEvent, void, void> {
    const endpoint = new URL(
      "chat/completions",
      `${this.config.baseUrl.replace(/\/+$/, "")}/`,
    );
    let response: Response;
    try {
      response = await (this.config.fetch ?? fetch)(endpoint, {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...request,
          ...(request.tools === undefined
            ? {}
            : {
                tools: adaptToolDefinitionsForProvider(
                  request.tools,
                  this.config.provider,
                ),
              }),
        }),
        signal,
      });
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        throw new ProviderError(
          "transport",
          "Provider request was interrupted.",
        );
      }
      throw new ProviderError("transport", "Provider request failed.");
    }

    if (!response.ok) {
      const providerMessage = await safeProviderMessage(
        response,
        this.config.apiKey,
      );
      const suffix = providerMessage ? ` ${providerMessage}` : "";
      throw new ProviderError(
        "provider",
        `Provider rejected the request (HTTP ${response.status}).${suffix}`,
      );
    }
    if (!response.body) {
      throw new ProviderError(
        "transport",
        "Provider response did not include a body.",
      );
    }

    let receivedDone = false;
    const toolCalls = new Map<number, PartialToolCall>();
    try {
      for await (const payload of parseSse(response.body)) {
        if (payload === "[DONE]") {
          yield* flushToolCalls(toolCalls);
          receivedDone = true;
          break;
        }
        yield* normalizePayload(payload, toolCalls);
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (signal.aborted || isAbortError(error)) {
        throw new ProviderError(
          "transport",
          "Provider request was interrupted.",
        );
      }
      if (
        error instanceof Error &&
        error.message.startsWith("Malformed SSE frame:")
      ) {
        throw new ProviderError("stream", error.message);
      }
      throw new ProviderError("stream", "Provider stream was malformed.");
    }

    if (!receivedDone) {
      throw new ProviderError(
        "stream",
        "Provider stream ended before completion.",
      );
    }
  }
}

interface PartialToolCall {
  id?: string;
  name?: string;
  arguments: string;
  extraContent?: JsonValue;
}

function* normalizePayload(
  payload: string,
  toolCalls: Map<number, PartialToolCall>,
): Generator<ModelStreamEvent, void, void> {
  let data: unknown;
  try {
    data = JSON.parse(payload) as unknown;
  } catch {
    throw new ProviderError(
      "stream",
      "Provider stream contained invalid JSON.",
    );
  }
  if (!isRecord(data)) return;

  const choices = data.choices;
  if (Array.isArray(choices) && isRecord(choices[0])) {
    const choice = choices[0];
    const delta = choices[0].delta;
    if (isRecord(delta)) {
      if (
        typeof delta.reasoning_content === "string" &&
        delta.reasoning_content
      ) {
        yield { type: "reasoning", text: delta.reasoning_content };
      }
      if (typeof delta.content === "string" && delta.content) {
        yield { type: "text", text: delta.content };
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const [position, rawCall] of delta.tool_calls.entries()) {
          if (!isRecord(rawCall)) continue;
          const index = resolveToolCallIndex(rawCall, position, toolCalls);
          const current = toolCalls.get(index) ?? { arguments: "" };
          if (typeof rawCall.id === "string") current.id = rawCall.id;
          const functionData = rawCall.function;
          if (isRecord(functionData)) {
            if (typeof functionData.name === "string")
              current.name = functionData.name;
            if (typeof functionData.arguments === "string") {
              current.arguments += functionData.arguments;
            } else if (
              functionData.arguments !== null &&
              isJsonValue(functionData.arguments)
            ) {
              current.arguments += JSON.stringify(functionData.arguments);
            }
          }
          if (
            rawCall.extra_content !== undefined &&
            isJsonValue(rawCall.extra_content)
          ) {
            current.extraContent = mergeJsonValue(
              current.extraContent,
              rawCall.extra_content,
            );
          }
          toolCalls.set(index, current);
        }
      }
    }
    if (typeof choice.finish_reason === "string") {
      if (toolCalls.size > 0) yield* flushToolCalls(toolCalls);
      yield {
        type: "finish",
        reason: normalizeFinishReason(choice.finish_reason),
      };
    }
  }

  const usage = data.usage;
  if (
    isRecord(usage) &&
    typeof usage.prompt_tokens === "number" &&
    typeof usage.completion_tokens === "number"
  ) {
    yield {
      type: "usage",
      input: usage.prompt_tokens,
      output: usage.completion_tokens,
    };
  }
}

function resolveToolCallIndex(
  rawCall: Record<string, unknown>,
  fallbackIndex: number,
  toolCalls: Map<number, PartialToolCall>,
): number {
  if (typeof rawCall.index === "number") return rawCall.index;
  if (typeof rawCall.id === "string") {
    for (const [index, call] of toolCalls) {
      if (call.id === rawCall.id) return index;
    }
  }
  return fallbackIndex;
}

function normalizeFinishReason(
  value: string,
): "stop" | "length" | "tool_calls" | "content_filter" | "unknown" {
  return value === "stop" ||
    value === "length" ||
    value === "tool_calls" ||
    value === "content_filter"
    ? value
    : "unknown";
}

function* flushToolCalls(
  toolCalls: Map<number, PartialToolCall>,
): Generator<ModelStreamEvent, void, void> {
  for (const index of [...toolCalls.keys()].sort(
    (left, right) => left - right,
  )) {
    const call = toolCalls.get(index);
    if (!call?.id || !call.name) {
      throw new ProviderError(
        "stream",
        "Provider stream contained an incomplete tool call.",
      );
    }
    const normalized: AssistantToolCall = {
      id: call.id,
      name: call.name,
      arguments: call.arguments,
      ...(call.extraContent === undefined
        ? {}
        : { extraContent: call.extraContent }),
    };
    yield { type: "tool_call", call: normalized };
    toolCalls.delete(index);
  }
}

async function safeProviderMessage(
  response: Response,
  apiKey: string,
): Promise<string | undefined> {
  try {
    const body = JSON.parse(await response.text()) as unknown;
    // Gemini's OpenAI-compatible endpoint wraps HTTP errors in an array.
    const envelope: unknown = Array.isArray(body) ? body[0] : body;
    if (
      !isRecord(envelope) ||
      !isRecord(envelope.error) ||
      typeof envelope.error.message !== "string"
    ) {
      return undefined;
    }
    return envelope.error.message
      .replaceAll(apiKey, "[redacted]")
      .replace(/[\r\n]+/g, " ");
  } catch {
    return undefined;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return (
    isRecord(value) && Object.values(value).every((entry) => isJsonValue(entry))
  );
}

function mergeJsonValue(
  current: JsonValue | undefined,
  incoming: JsonValue,
): JsonValue {
  if (
    isRecord(current) &&
    !Array.isArray(current) &&
    isRecord(incoming) &&
    !Array.isArray(incoming)
  ) {
    const merged: Record<string, JsonValue> = { ...current };
    for (const [key, value] of Object.entries(incoming)) {
      merged[key] = mergeJsonValue(merged[key], value);
    }
    return merged;
  }
  return incoming;
}
