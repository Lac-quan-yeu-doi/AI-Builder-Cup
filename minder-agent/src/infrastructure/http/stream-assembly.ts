import type { AssistantToolCall } from "@infrastructure/ai";

interface PartialToolCall {
  id?: string;
  name?: string;
  arguments: string;
}

/**
 * Accumulates streamed provider tool-call deltas by index and flushes them in
 * ascending index order, preserving the assembly ordering used by the OpenAI-
 * compatible gateway. Minder owns the resulting event types and error shapes.
 */
export class StreamToolCallAssembler {
  private readonly calls = new Map<number, PartialToolCall>();

  ingest(delta: {
    readonly index: number;
    readonly id?: string;
    readonly name?: string;
    readonly argumentsChunk?: string;
  }): void {
    const current = this.calls.get(delta.index) ?? { arguments: "" };
    if (delta.id !== undefined) current.id = delta.id;
    if (delta.name !== undefined) current.name = delta.name;
    if (delta.argumentsChunk !== undefined)
      current.arguments += delta.argumentsChunk;
    this.calls.set(delta.index, current);
  }

  /** Flush completed tool calls in ascending index order. */
  flush(): readonly AssistantToolCall[] {
    const ordered: AssistantToolCall[] = [];
    for (const index of [...this.calls.keys()].sort((a, b) => a - b)) {
      const call = this.calls.get(index);
      if (!call?.id || !call.name)
        throw new Error("Provider stream contained an incomplete tool call.");
      ordered.push({
        id: call.id,
        name: call.name,
        arguments: call.arguments,
      });
      this.calls.delete(index);
    }
    return ordered;
  }

  get pending(): number {
    return this.calls.size;
  }
}
