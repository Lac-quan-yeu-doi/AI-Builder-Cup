import type { AgentEvent, JsonObject } from "@domain/shared";
import type {
  RuntimeToolResult,
  ToolContext,
  ToolRegistryPort,
} from "@application/shared/ports/index.js";

/** A provider tool call normalized before it crosses the native loop boundary. */
export interface NativeToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

export interface NativeToolCallOptions {
  readonly calls: readonly NativeToolCall[];
  readonly registry: ToolRegistryPort;
  readonly context: ToolContext;
}

/**
 * Execute model-issued tools in provider order.
 *
 * Pi's execution harness separates call parsing, execution, and durable result
 * construction. Minder keeps that separation here, while the runtime remains
 * responsible for journaling these emitted events before it broadcasts them.
 */
export async function* streamNativeToolCalls(
  options: NativeToolCallOptions,
): AsyncGenerator<AgentEvent, void, void> {
  for (const call of options.calls) {
    const arguments_ = parseObject(call.arguments);
    yield {
      type: "tool_started",
      data: { id: call.id, name: call.name, arguments: arguments_ ?? {} },
    };

    const result = arguments_
      ? await options.registry.execute(call.name, arguments_, options.context)
      : invalidArguments(call.name);

    yield {
      type: "tool_finished",
      data: { id: call.id, name: call.name, success: result.success },
    };
    yield {
      type: "tool_result",
      data: {
        id: call.id,
        name: call.name,
        is_error: !result.success,
        content: result.output,
      },
    };
  }
}

function parseObject(value: string): JsonObject | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidArguments(name: string): RuntimeToolResult {
  return {
    success: false,
    output: `Tool ${name} arguments were not valid JSON.`,
    metadata: {},
  };
}
