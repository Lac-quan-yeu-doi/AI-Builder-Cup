import type {
  ChatCompletionGateway,
  ChatMessage,
  MinderTool,
  ToolContext,
  ToolDefinition,
  ToolRegistryPort,
} from "@application/shared/ports/index.js";
import type {
  JsonObject as PortsJsonObject,
  JsonValue,
} from "@domain/index.js";
import type {
  ModelDelta,
  ModelPort,
  ModelRequest,
  ToolPort,
} from "@application/shared/ports/index.js";

/**
 * Adapt the runtime `ChatCompletionGateway` (raw string tool-call arguments,
 * `@infrastructure/ai` message shape) into the provider-agnostic `ModelPort` the ReAct
 * loop consumes. The real model id and temperature are captured here so the
 * loop never has to know about them.
 */
export function gatewayToModelPort(
  gateway: ChatCompletionGateway,
  model: string,
  temperature: number | undefined,
  maxTokens: number | undefined = undefined,
  provider: string | undefined = undefined,
): ModelPort {
  return {
    async *stream(
      request: ModelRequest,
      signal: AbortSignal,
    ): AsyncIterable<ModelDelta> {
      const toolNames = new Map<string, string>();
      const messages = request.messages.map((message): ChatMessage => {
        if (message.role === "assistant") {
          for (const call of message.toolCalls ?? [])
            toolNames.set(call.id, call.name);
        }
        if (message.role === "tool") {
          const toolName = toolNames.get(message.toolCallId ?? "");
          return {
            role: "tool",
            ...(toolName === undefined ? {} : { name: toolName }),
            tool_call_id: message.toolCallId ?? "",
            content: message.content,
          };
        }
        if (
          message.role === "assistant" &&
          message.toolCalls &&
          message.toolCalls.length > 0
        ) {
          return {
            role: "assistant",
            content: message.content,
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: "function" as const,
              function: {
                name: call.name,
                arguments:
                  typeof call.arguments === "string"
                    ? call.arguments
                    : JSON.stringify(call.arguments),
              },
              ...(call.extraContent === undefined
                ? {}
                : { extra_content: call.extraContent }),
            })),
          };
        }
        if (message.role === "assistant")
          return { role: "assistant", content: message.content };
        return { role: message.role, content: message.content };
      });
      const tools: ToolDefinition[] | undefined = request.tools?.map(
        (tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        }),
      );
      const adaptedTools =
        tools === undefined
          ? undefined
          : adaptToolDefinitionsForProvider(tools, provider);
      const streamRequest = {
        model,
        messages,
        stream: true as const,
        ...(adaptedTools && adaptedTools.length > 0
          ? { tools: adaptedTools, tool_choice: "auto" as const }
          : {}),
        ...(temperature === undefined ? {} : { temperature }),
        ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      };
      let toolCallIndex = 0;
      for await (const event of gateway.stream(streamRequest, signal)) {
        switch (event.type) {
          case "text":
            yield { text: event.text };
            break;
          case "reasoning":
            yield { reasoning: event.text };
            break;
          case "usage":
            yield { usage: { input: event.input, output: event.output } };
            break;
          case "finish":
            yield { finishReason: event.reason };
            break;
          case "tool_call":
            yield {
              toolCallDelta: {
                index: toolCallIndex,
                id: event.call.id,
                name: event.call.name,
                argumentsText: event.call.arguments,
                ...(event.call.extraContent === undefined
                  ? {}
                  : { extraContent: event.call.extraContent }),
              },
            };
            toolCallIndex += 1;
            break;
        }
      }
    },
  };
}

/**
 * Wrap `@infrastructure/tools/core` registry tools as `ToolPort`s. Execution routes
 * through the registry so validation, policy, and redaction still apply.
 */
export function registryToToolPorts(
  registry: ToolRegistryPort,
  tools: readonly MinderTool[],
  toolContext: Omit<ToolContext, "signal">,
): readonly ToolPort[] {
  return tools.map((tool): ToolPort => ({
    descriptor: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      category: tool.category ?? "meta",
      readOnly: tool.readOnly ?? false,
      destructive: tool.destructive ?? false,
      aliases: tool.aliases ?? [],
    },
    async execute(args, context) {
      const result = await registry.execute(tool.name, args, {
        ...toolContext,
        signal: context.signal,
      });
      if (result.success && !tool.readOnly && toolContext.syncWorkspace) {
        try {
          await toolContext.syncWorkspace();
        } catch (error) {
          return {
            success: false,
            content:
              error instanceof Error
                ? `Workspace synchronization failed: ${error.message}`
                : "Workspace synchronization failed.",
            metadata: {},
          };
        }
      }
      return {
        success: result.success,
        content: result.output,
        metadata: result.metadata as unknown as PortsJsonObject,
      };
    },
  }));
}

function adaptToolDefinitionsForProvider(
  tools: readonly ToolDefinition[],
  provider: string | undefined,
): ToolDefinition[] {
  if (
    provider?.toLowerCase() !== "gemini" &&
    provider?.toLowerCase() !== "google"
  )
    return [...tools];
  return tools.map((tool) => ({
    ...tool,
    function: {
      ...tool.function,
      parameters: stripProviderSchema(tool.function.parameters),
    },
  }));
}

function stripProviderSchema(value: PortsJsonObject): PortsJsonObject {
  const result: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (["additionalProperties", "default", "$schema", "format"].includes(key))
      continue;
    result[key] = Array.isArray(entry)
      ? (entry as readonly JsonValue[]).map((item) =>
          typeof item === "object" && item !== null && !Array.isArray(item)
            ? stripProviderSchema(item as PortsJsonObject)
            : item,
        )
      : typeof entry === "object" && entry !== null
        ? stripProviderSchema(entry as PortsJsonObject)
        : entry;
  }
  return result;
}
