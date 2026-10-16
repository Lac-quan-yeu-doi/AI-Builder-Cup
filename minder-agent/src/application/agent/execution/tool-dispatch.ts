import type { JsonObject, JsonValue } from "@domain/index.js";
import type {
  ToolExecutionContext,
  ToolPort,
  ToolResult,
} from "@application/shared/ports/index.js";
import { type LoopEffect, extractToolEffects } from "./effects.js";

export interface AssembledToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonValue;
  readonly rawArguments?: string;
  readonly extraContent?: JsonValue;
}

export interface DispatchedToolResult {
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonObject;
  readonly isError: boolean;
  readonly content: string;
  readonly metadata: JsonObject;
  readonly effects: readonly LoopEffect[];
}

export interface DispatchOptions {
  readonly truncated?: boolean;
  readonly allowParallelReadOnly: boolean;
}

const errorResult = (
  id: string,
  name: string,
  arguments_: JsonObject,
  content: string,
): DispatchedToolResult => ({
  id,
  name,
  arguments: arguments_,
  isError: true,
  content,
  metadata: {},
  effects: [],
});

const interruptedResult = (call: AssembledToolCall): DispatchedToolResult =>
  errorResult(
    call.id,
    call.name,
    isRecord(call.arguments) ? call.arguments : {},
    `Tool ${call.name} was not executed because the run was interrupted.`,
  );

function isRecord(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function findTool(
  name: string,
  tools: readonly ToolPort[],
): ToolPort | undefined {
  return tools.find(
    (candidate) =>
      candidate.descriptor.name === name ||
      candidate.descriptor.aliases.includes(name),
  );
}

async function runOne(
  call: AssembledToolCall,
  tools: readonly ToolPort[],
  context: ToolExecutionContext,
  truncated: boolean,
): Promise<DispatchedToolResult> {
  const arguments_ = isRecord(call.arguments) ? call.arguments : {};
  if (truncated) {
    return errorResult(
      call.id,
      call.name,
      arguments_,
      `Tool "${call.name}" was not executed: the response hit the output token limit, so its arguments may be truncated. Re-issue the tool call with complete arguments.`,
    );
  }
  if (call.rawArguments !== undefined) {
    try {
      JSON.parse(call.rawArguments);
    } catch {
      return errorResult(
        call.id,
        call.name,
        arguments_,
        `Tool ${call.name} was not executed because its arguments were invalid JSON: ${call.rawArguments}`,
      );
    }
  }
  const tool = findTool(call.name, tools);
  if (!tool)
    return errorResult(
      call.id,
      call.name,
      arguments_,
      `Tool ${call.name} not found.`,
    );
  if (!isRecord(call.arguments)) {
    return errorResult(
      call.id,
      call.name,
      arguments_,
      `Tool ${call.name} arguments were not a JSON object.`,
    );
  }
  try {
    const result: ToolResult = await tool.execute(call.arguments, context);
    return {
      id: call.id,
      name: call.name,
      arguments: arguments_,
      isError: !result.success,
      content: result.content,
      metadata: result.metadata,
      effects: extractToolEffects(tool.descriptor.name, result),
    };
  } catch (error) {
    return errorResult(
      call.id,
      call.name,
      arguments_,
      error instanceof Error ? error.message : `Tool ${call.name} failed.`,
    );
  }
}

/**
 * Execute a batch of model-issued tool calls over the injected `ToolPort`s.
 *
 * Results are returned in the same order as `calls`. Read-only batches may run
 * concurrently when `allowParallelReadOnly` is set, but the returned order is
 * still preserved. Truncated messages, unknown tools, non-object arguments, and
 * thrown tool errors each become durable error results rather than throwing.
 */
export async function dispatchToolCalls(
  calls: readonly AssembledToolCall[],
  tools: readonly ToolPort[],
  context: ToolExecutionContext,
  options: DispatchOptions,
): Promise<readonly DispatchedToolResult[]> {
  const truncated = options.truncated === true;
  const results: DispatchedToolResult[] = [];
  for (let index = 0; index < calls.length;) {
    if (context.signal.aborted) {
      results.push(...calls.slice(index).map(interruptedResult));
      break;
    }
    const call = calls[index]!;
    const tool = findTool(call.name, tools);
    const parallelizable =
      options.allowParallelReadOnly &&
      !truncated &&
      tool?.descriptor.readOnly === true;
    if (!parallelizable) {
      results.push(await runOne(call, tools, context, truncated));
      index += 1;
      continue;
    }

    let end = index + 1;
    while (
      end < calls.length &&
      findTool(calls[end]!.name, tools)?.descriptor.readOnly === true
    ) {
      end += 1;
    }
    const batch = calls.slice(index, end);
    results.push(
      ...(await Promise.all(
        batch.map((candidate) => runOne(candidate, tools, context, truncated)),
      )),
    );
    index = end;
  }
  return results;
}
