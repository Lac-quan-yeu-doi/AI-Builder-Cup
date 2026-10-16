import type {
  ChatCompletionGateway,
  ChatMessage,
  ChatToolCall,
  ModelPort,
  ModelRequest,
  ModelStreamEvent,
  ToolDefinition,
} from "@application/shared/ports/index.js";
import type { JsonObject } from "@domain/index.js";
import {
  AIMessage,
  AIMessageChunk,
  type BaseMessage,
  type InvalidToolCall,
  type ToolCall,
} from "@langchain/core/messages";
import {
  BaseChatModel,
  type BaseChatModelCallOptions,
  type BindToolsInput,
} from "@langchain/core/language_models/chat_models";
import { ChatGenerationChunk, type ChatResult } from "@langchain/core/outputs";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";

export interface LangChainChatModelOptions {
  readonly gateway: ChatCompletionGateway;
  readonly model: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly provider?: string;
}

export function createLangChainModelPort(model: ModelPort): BaseChatModel {
  return new GatewayChatModel({
    gateway: new ModelPortGateway(model),
    model: "",
  });
}

type GatewayCallOptions = BaseChatModelCallOptions;

class GatewayChatModel extends BaseChatModel<GatewayCallOptions> {
  private readonly options: LangChainChatModelOptions;
  private readonly boundTools: readonly ToolDefinition[];

  constructor(
    options: LangChainChatModelOptions,
    boundTools: readonly ToolDefinition[] = [],
  ) {
    super({});
    this.options = options;
    this.boundTools = boundTools;
  }

  override bindTools(tools: BindToolsInput[]) {
    const definitions = tools.map(
      (tool) => convertToOpenAITool(tool) as unknown as ToolDefinition,
    );
    return new GatewayChatModel(this.options, definitions);
  }

  _llmType(): string {
    return "minder-openai-compatible";
  }

  async _generate(
    messages: BaseMessage[],
    callOptions: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    let content = "";
    let usage: { input: number; output: number } | undefined;
    let finishReason: string | undefined;
    const toolCalls: ToolCall[] = [];
    const invalidToolCalls: InvalidToolCall[] = [];

    for await (const event of this.streamGateway(messages, callOptions)) {
      if (event.type === "text") {
        content += event.text;
        await runManager?.handleLLMNewToken(event.text);
      } else if (event.type === "usage") usage = event;
      else if (event.type === "finish") finishReason = event.reason;
      else if (event.type === "tool_call") {
        const parsed = parseArguments(event.call.arguments);
        if (parsed === undefined) {
          invalidToolCalls.push({
            type: "invalid_tool_call",
            id: event.call.id,
            name: event.call.name,
            args: event.call.arguments,
            error: "Tool arguments were not valid JSON.",
          });
        } else {
          toolCalls.push({
            type: "tool_call",
            id: event.call.id,
            name: event.call.name,
            args: parsed,
          });
        }
      }
    }

    const message = new AIMessage(content);
    if (toolCalls.length > 0) message.tool_calls = toolCalls;
    if (invalidToolCalls.length > 0)
      message.invalid_tool_calls = invalidToolCalls;
    message.response_metadata = {
      ...(finishReason === undefined ? {} : { finish_reason: finishReason }),
      ...(usage === undefined ? {} : { usage }),
      ...(this.options.provider === undefined
        ? {}
        : { provider: this.options.provider }),
    };
    return {
      generations: [
        {
          text: content,
          message,
        },
      ],
    };
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    callOptions: this["ParsedCallOptions"],
  ): AsyncGenerator<ChatGenerationChunk> {
    let toolIndex = 0;
    for await (const event of this.streamGateway(messages, callOptions)) {
      switch (event.type) {
        case "text":
          yield new ChatGenerationChunk({
            text: event.text,
            message: new AIMessageChunk({ content: event.text }),
          });
          break;
        case "reasoning":
          yield new ChatGenerationChunk({
            text: "",
            message: new AIMessageChunk({
              content: "",
              additional_kwargs: { reasoning_content: event.text },
            }),
          });
          break;
        case "tool_call":
          yield new ChatGenerationChunk({
            text: "",
            message: new AIMessageChunk({
              content: "",
              tool_call_chunks: [
                {
                  index: toolIndex++,
                  id: event.call.id,
                  name: event.call.name,
                  args: event.call.arguments,
                },
              ],
            }),
          });
          break;
        case "usage":
          yield new ChatGenerationChunk({
            text: "",
            generationInfo: {
              usage: {
                input_tokens: event.input,
                output_tokens: event.output,
                total_tokens: event.input + event.output,
              },
            },
            message: new AIMessageChunk({ content: "" }),
          });
          break;
        case "finish":
          yield new ChatGenerationChunk({
            text: "",
            generationInfo: { finish_reason: event.reason },
            message: new AIMessageChunk({ content: "" }),
          });
          break;
      }
    }
  }

  private async *streamGateway(
    messages: BaseMessage[],
    callOptions: this["ParsedCallOptions"],
  ) {
    const request = {
      model: this.options.model,
      messages: messages.map(toChatMessage),
      stream: true as const,
      ...(this.boundTools.length === 0
        ? {}
        : { tools: this.boundTools, tool_choice: "auto" as const }),
      ...(this.options.temperature === undefined
        ? {}
        : { temperature: this.options.temperature }),
      ...(this.options.maxTokens === undefined
        ? {}
        : { max_tokens: this.options.maxTokens }),
    };
    const signal = callOptions.signal ?? new AbortController().signal;
    yield* this.options.gateway.stream(request, signal);
  }
}

class ModelPortGateway implements ChatCompletionGateway {
  constructor(private readonly model: ModelPort) {}

  async *stream(
    request: Parameters<ChatCompletionGateway["stream"]>[0],
    signal: AbortSignal,
  ): AsyncIterable<ModelStreamEvent> {
    const modelRequest: ModelRequest = {
      model: request.model,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.role === "assistant" && message.tool_calls === undefined
          ? {}
          : message.role === "assistant"
            ? {
                toolCalls: (message.tool_calls ?? []).map((call) => ({
                  id: call.id,
                  name: call.function.name,
                  arguments: parseArguments(call.function.arguments) ?? {},
                  rawArguments: call.function.arguments,
                })),
              }
            : message.role === "tool"
              ? { toolCallId: message.tool_call_id }
              : {}),
      })),
      ...(request.tools === undefined
        ? {}
        : {
            tools: request.tools.map((tool) => ({
              name: tool.function.name,
              description: tool.function.description,
              parameters: tool.function.parameters,
            })),
          }),
    };
    for await (const delta of this.model.stream(modelRequest, signal)) {
      if (delta.text !== undefined) yield { type: "text", text: delta.text };
      if (delta.reasoning !== undefined)
        yield { type: "reasoning", text: delta.reasoning };
      if (delta.toolCall !== undefined) {
        yield {
          type: "tool_call",
          call: {
            id: delta.toolCall.id,
            name: delta.toolCall.name,
            arguments:
              delta.toolCall.rawArguments ??
              JSON.stringify(delta.toolCall.arguments),
            ...(delta.toolCall.extraContent === undefined
              ? {}
              : { extraContent: delta.toolCall.extraContent }),
          },
        };
      }
      if (delta.toolCallDelta !== undefined) {
        const call = delta.toolCallDelta;
        yield {
          type: "tool_call",
          call: {
            id: call.id ?? `tool-${call.index}`,
            name: call.name ?? "unknown",
            arguments: call.argumentsText ?? "{}",
            ...(call.extraContent === undefined
              ? {}
              : { extraContent: call.extraContent }),
          },
        };
      }
      if (delta.usage !== undefined)
        yield {
          type: "usage",
          input: delta.usage.input,
          output: delta.usage.output,
        };
      if (delta.finishReason !== undefined)
        yield { type: "finish", reason: delta.finishReason };
    }
  }
}

export function createLangChainChatModel(
  options: LangChainChatModelOptions,
): BaseChatModel {
  return new GatewayChatModel(options);
}

function toChatMessage(message: BaseMessage): ChatMessage {
  const content = toText(message.content);
  if (message.type === "ai") {
    const toolCalls =
      "tool_calls" in message
        ? (message.tool_calls as
            | readonly { id?: string; name: string; args: JsonObject }[]
            | undefined)
        : undefined;
    return {
      role: "assistant",
      content,
      ...(toolCalls === undefined || toolCalls.length === 0
        ? {}
        : {
            tool_calls: toolCalls.map((call): ChatToolCall => ({
              id: call.id ?? "",
              type: "function",
              function: {
                name: call.name,
                arguments: JSON.stringify(call.args),
              },
            })),
          }),
    };
  }
  if (message.type === "tool") {
    return {
      role: "tool",
      ...(message.name === undefined ? {} : { name: message.name }),
      tool_call_id:
        "tool_call_id" in message ? String(message.tool_call_id) : "",
      content,
    };
  }
  return { role: message.type === "system" ? "system" : "user", content };
}

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return JSON.stringify(value);
  return value
    .map((part) => {
      if (typeof part === "string") return part;
      if (isRecord(part) && typeof part.text === "string") return part.text;
      return JSON.stringify(part);
    })
    .join("");
}

function parseArguments(value: string): JsonObject | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
