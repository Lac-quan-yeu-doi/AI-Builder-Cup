import type {
  AgentLoop,
  AgentLoopExecution,
  AgentLoopInput,
  AgentLoopOutcome,
  AgentLifecycleEvent,
} from "@application/agent";
import type { ModelMessage } from "@application/shared/ports/index.js";
import type { JsonObject, JsonValue } from "@domain/index.js";
import { createAgent } from "langchain";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { createLangChainModelPort } from "./model.js";
import { toolPortsToLangChainTools } from "./tools.js";

export interface LangChainAgentLoopOptions {
  readonly checkpointer?: BaseCheckpointSaver;
}

export function createLangChainAgentLoop(
  options: LangChainAgentLoopOptions = {},
): AgentLoop {
  return {
    run(input, signal): AgentLoopExecution {
      const queue = new AsyncEventQueue<AgentLifecycleEvent>();
      const outcome = runLangChain(input, signal, options, queue);
      return { events: queue, outcome };
    },
  };
}

async function runLangChain(
  input: AgentLoopInput,
  signal: AbortSignal,
  options: LangChainAgentLoopOptions,
  queue: AsyncEventQueue<AgentLifecycleEvent>,
): Promise<AgentLoopOutcome> {
  try {
    if (signal.aborted) return finish(queue, { kind: "interrupted", text: "" });
    if (input.checkpointThreadId === undefined) {
      return fail(
        queue,
        "LangGraph requires a server-owned checkpoint thread ID.",
      );
    }
    if (input.snapshot !== undefined || input.continuation !== undefined) {
      return fail(
        queue,
        "LangGraph resume requires its Postgres checkpoint; native loop snapshots are not supported.",
      );
    }

    const visibleTools =
      input.run.mode === "autonomous"
        ? input.services.tools.filter((tool) => tool.descriptor.readOnly)
        : input.services.tools;
    const agent = createAgent({
      model: createLangChainModelPort(input.services.model),
      tools: [...toolPortsToLangChainTools(visibleTools)],
      ...(input.systemPrompt === undefined
        ? {}
        : { systemPrompt: input.systemPrompt }),
      ...(options.checkpointer === undefined
        ? {}
        : { checkpointer: options.checkpointer }),
    });
    const messages = (
      input.history ?? [{ role: "user", content: input.run.input }]
    ).map(toLangChainMessage);
    const stream = await agent.streamEvents(
      { messages },
      {
        version: "v3",
        signal,
        configurable: { thread_id: input.checkpointThreadId },
        recursionLimit: Math.max(1, input.policy.maxIterations * 2 + 1),
      },
    );
    const toolCalls = new Map<
      string,
      { name: string; arguments: JsonObject }
    >();
    let text = "";
    for await (const event of stream) {
      if (event.method === "messages") {
        const data = event.params.data as Record<string, unknown>;
        if (data.event === "message-start" && data.role !== "tool")
          queue.push({ type: "model_started", data: {} });
        if (data.event === "content-block-delta") {
          const delta = data.delta as Record<string, unknown>;
          if (delta.type === "text-delta" && typeof delta.text === "string") {
            text += delta.text;
            queue.push({
              type: "stream_delta",
              data: { text: delta.text },
            });
          }
          if (
            delta.type === "reasoning-delta" &&
            typeof delta.reasoning === "string"
          )
            queue.push({
              type: "stream_delta",
              data: { reasoning: delta.reasoning },
            });
        }
        if (data.event === "content-block-finish") {
          const block = data.contentBlock ?? data.content_block;
          if (isRecord(block) && block.type === "tool_call") {
            const id = stringValue(block.id, "");
            const name = stringValue(block.name, "unknown");
            const args = isJsonObject(block.args ?? block.input)
              ? ((block.args ?? block.input) as JsonObject)
              : {};
            toolCalls.set(id, { name, arguments: args });
            queue.push({
              type: "tool_dispatched",
              data: { id, name, arguments: args },
            });
          }
        }
        if (
          data.event === "message-finish" &&
          data.role !== "tool" &&
          isJsonObject(data.usage)
        ) {
          const usage = data.usage;
          const inputTokens = Number(usage.input_tokens ?? 0);
          const outputTokens = Number(usage.output_tokens ?? 0);
          if (inputTokens > 0 || outputTokens > 0)
            queue.push({
              type: "stream_delta",
              data: {
                usage: { input: inputTokens, output: outputTokens },
              },
            });
        }
        if (data.event === "message-finish" && data.role !== "tool")
          queue.push({ type: "model_finished", data: {} });
      }
      if (event.method === "tools") {
        const data = event.params.data as Record<string, unknown>;
        const id = stringValue(data.tool_call_id, "");
        const call = toolCalls.get(id) ?? {
          name: stringValue(data.tool_name, "unknown"),
          arguments: isJsonObject(data.input) ? data.input : {},
        };
        if (data.event === "tool-started")
          toolCalls.set(id, { name: call.name, arguments: call.arguments });
        if (data.event === "tool-finished" || data.event === "tool-error") {
          const isError = data.event === "tool-error";
          queue.push({
            type: "tool_result",
            data: {
              id,
              name: call.name,
              arguments: call.arguments,
              isError,
              content:
                data.event === "tool-error"
                  ? stringValue(data.message, "Tool failed.")
                  : stringify(data.output),
            },
          });
          toolCalls.delete(id);
        }
      }
    }
    if (signal.aborted || stream.interrupted)
      return finish(queue, { kind: "interrupted", text });
    return finish(queue, { kind: "completed", text });
  } catch (error) {
    if (signal.aborted) return finish(queue, { kind: "interrupted", text: "" });
    return fail(queue, error instanceof Error ? error.message : String(error));
  }
}

function toLangChainMessage(message: ModelMessage) {
  if (message.role === "system") return new SystemMessage(message.content);
  if (message.role === "user") return new HumanMessage(message.content);
  if (message.role === "tool")
    return new ToolMessage({
      content: message.content,
      tool_call_id: message.toolCallId ?? "",
    });
  return new AIMessage({
    content: message.content,
    ...(message.toolCalls === undefined
      ? {}
      : {
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            name: call.name,
            args: isJsonObject(call.arguments) ? call.arguments : {},
          })),
        }),
  });
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return isJsonObject(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (isJsonObject(value) && typeof value.content === "string")
    return value.content;
  return JSON.stringify(value) ?? "";
}

function finish(
  queue: AsyncEventQueue<AgentLifecycleEvent>,
  outcome: AgentLoopOutcome,
): AgentLoopOutcome {
  queue.push({
    type:
      outcome.kind === "interrupted"
        ? "interrupted"
        : outcome.kind === "failed"
          ? "failed"
          : "completed",
    data: { outcome } as unknown as JsonValue,
  });
  queue.close();
  return outcome;
}

function fail(
  queue: AsyncEventQueue<AgentLifecycleEvent>,
  error: string,
): AgentLoopOutcome {
  return finish(queue, { kind: "failed", text: "", error });
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: ((result: IteratorResult<T>) => void)[] = [];
  private closed = false;

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value });
    else this.values.push(value);
  }

  close(): void {
    this.closed = true;
    while (this.waiters.length > 0)
      this.waiters.shift()!({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value !== undefined) return Promise.resolve({ done: false, value });
        if (this.closed)
          return Promise.resolve({ done: true, value: undefined });
        return new Promise<IteratorResult<T>>((resolve) =>
          this.waiters.push(resolve),
        );
      },
    };
  }
}
