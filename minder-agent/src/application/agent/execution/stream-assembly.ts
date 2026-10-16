import type { JsonValue } from "@domain/index.js";
import type { ModelDelta } from "@application/shared/ports/index.js";

export interface AssembledModelToolCall {
  readonly id: string;
  readonly name: string;
  readonly rawArguments: string;
  readonly parsedArguments?: JsonValue;
  readonly parseError?: string;
  readonly complete: boolean;
  readonly extraContent?: JsonValue;
}

export interface AssembledModelTurn {
  readonly text: string;
  readonly reasoning: string;
  readonly toolCalls: readonly AssembledModelToolCall[];
  readonly finishReason?: ModelDelta["finishReason"];
}

interface PendingToolCall {
  id?: string;
  name?: string;
  rawArguments: string;
  parsedArguments?: JsonValue;
  extraContent?: JsonValue;
}

export interface ModelTurnAssembly {
  readonly text: string;
  readonly reasoning: string;
  readonly finishReason?: ModelDelta["finishReason"];
  readonly toolCalls: ReadonlyMap<number, PendingToolCall>;
}

export function beginModelTurn(): ModelTurnAssembly {
  return { text: "", reasoning: "", toolCalls: new Map() };
}

/** Append a provider delta without prematurely parsing tool arguments. */
export function appendDelta(
  assembly: ModelTurnAssembly,
  delta: ModelDelta,
): ModelTurnAssembly {
  const toolCalls = new Map(assembly.toolCalls);
  if (delta.toolCallDelta) {
    const fragment = delta.toolCallDelta;
    const prior = toolCalls.get(fragment.index) ?? { rawArguments: "" };
    toolCalls.set(fragment.index, {
      ...(fragment.id === undefined && prior.id === undefined
        ? {}
        : { id: fragment.id ?? prior.id! }),
      ...(fragment.name === undefined && prior.name === undefined
        ? {}
        : { name: fragment.name ?? prior.name! }),
      rawArguments: prior.rawArguments + (fragment.argumentsText ?? ""),
      ...(prior.parsedArguments === undefined
        ? {}
        : { parsedArguments: prior.parsedArguments }),
      ...(fragment.extraContent === undefined
        ? prior.extraContent === undefined
          ? {}
          : { extraContent: prior.extraContent }
        : {
            extraContent: mergeJsonValue(
              prior.extraContent,
              fragment.extraContent,
            ),
          }),
    });
  }
  if (delta.toolCall) {
    const index = nextLegacyIndex(toolCalls);
    toolCalls.set(index, {
      id: delta.toolCall.id,
      name: delta.toolCall.name,
      rawArguments:
        delta.toolCall.rawArguments ?? JSON.stringify(delta.toolCall.arguments),
      parsedArguments: delta.toolCall.arguments,
      ...(delta.toolCall.extraContent === undefined
        ? {}
        : { extraContent: delta.toolCall.extraContent }),
    });
  }
  return {
    text: assembly.text + (delta.text ?? ""),
    reasoning: assembly.reasoning + (delta.reasoning ?? ""),
    ...(delta.finishReason === undefined
      ? assembly.finishReason === undefined
        ? {}
        : { finishReason: assembly.finishReason }
      : { finishReason: delta.finishReason }),
    toolCalls,
  };
}

/** Finalize a provider turn, parsing each fully concatenated raw payload once. */
export function finalizeModelTurn(
  assembly: ModelTurnAssembly,
): AssembledModelTurn {
  return {
    text: assembly.text,
    reasoning: assembly.reasoning,
    ...(assembly.finishReason === undefined
      ? {}
      : { finishReason: assembly.finishReason }),
    toolCalls: [...assembly.toolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, call]) => finalizeCall(index, call)),
  };
}

export function assembleModelTurn(
  deltas: Iterable<ModelDelta>,
): AssembledModelTurn {
  let assembly = beginModelTurn();
  for (const delta of deltas) assembly = appendDelta(assembly, delta);
  return finalizeModelTurn(assembly);
}

function nextLegacyIndex(calls: ReadonlyMap<number, PendingToolCall>): number {
  if (calls.size === 0) return 0;
  return Math.max(...calls.keys()) + 1;
}

function finalizeCall(
  index: number,
  call: PendingToolCall,
): AssembledModelToolCall {
  if (call.parsedArguments !== undefined) {
    return {
      id: call.id ?? `missing-tool-call-id-${index}`,
      name: call.name ?? "",
      rawArguments: call.rawArguments,
      parsedArguments: call.parsedArguments,
      complete: true,
      ...(call.extraContent === undefined
        ? {}
        : { extraContent: call.extraContent }),
    };
  }
  try {
    return {
      id: call.id ?? `missing-tool-call-id-${index}`,
      name: call.name ?? "",
      rawArguments: call.rawArguments,
      parsedArguments: JSON.parse(call.rawArguments) as JsonValue,
      ...(call.extraContent === undefined
        ? {}
        : { extraContent: call.extraContent }),
      complete: true,
    };
  } catch (error) {
    return {
      id: call.id ?? `missing-tool-call-id-${index}`,
      name: call.name ?? "",
      rawArguments: call.rawArguments,
      parseError: `Invalid JSON: ${
        error instanceof Error ? error.message : "Unable to parse arguments"
      }`,
      ...(call.extraContent === undefined
        ? {}
        : { extraContent: call.extraContent }),
      complete: true,
    };
  }
}

function mergeJsonValue(
  current: JsonValue | undefined,
  incoming: JsonValue,
): JsonValue {
  if (
    isRecord(current) &&
    isRecord(incoming) &&
    !Array.isArray(current) &&
    !Array.isArray(incoming)
  ) {
    const merged: Record<string, JsonValue> = { ...current };
    for (const [key, value] of Object.entries(incoming))
      merged[key] = mergeJsonValue(merged[key], value);
    return merged;
  }
  return incoming;
}

function isRecord(
  value: JsonValue | undefined,
): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
