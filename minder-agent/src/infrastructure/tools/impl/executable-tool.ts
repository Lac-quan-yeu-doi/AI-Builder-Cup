import type { JsonObject } from "@domain/index.js";
import type {
  ToolDescriptor,
  ToolExecutionContext,
  ToolPort,
  ToolResult,
} from "@application/shared/ports/index.js";
import type { ToolPolicy } from "./policy.js";
import {
  boundToolResult,
  failureResult,
  type ExecutorResult,
  DEFAULT_TOOL_OUTPUT_LIMIT,
} from "./result.js";

export type ToolExecutor = (
  args: JsonObject,
  context: ToolExecutionContext,
) => Promise<ExecutorResult>;

export interface ExecutableToolOptions {
  readonly outputLimit?: number;
}

/**
 * Wrap a bare executor in a policy-governed {@link ToolPort}. The wrapper, in
 * order: validates arguments against the descriptor schema, honours a
 * pre-aborted signal, enforces the caller-aware policy, runs the executor, and
 * bounds its output. Denials and failures never reach the executor and return
 * stable machine-readable codes.
 */
export function executableTool(
  descriptor: ToolDescriptor,
  policy: ToolPolicy,
  execute: ToolExecutor,
  options: ExecutableToolOptions = {},
): ToolPort {
  const limit = options.outputLimit ?? DEFAULT_TOOL_OUTPUT_LIMIT;
  return {
    descriptor,
    outputLimit: limit,
    async execute(
      args: JsonObject,
      context: ToolExecutionContext,
    ): Promise<ToolResult> {
      const invalid = validateJsonObject(args, descriptor.parameters);
      if (invalid) return failureResult("tool_invalid_arguments", invalid);
      if (context.signal.aborted)
        return failureResult("tool_cancelled", "Tool execution was cancelled.");

      const decision = await policy.assertAllowed(descriptor, context, args);
      if (!decision.allowed)
        return failureResult(
          "tool_denied",
          decision.reason ?? "Tool is not permitted for this caller.",
        );

      if (context.signal.aborted)
        return failureResult("tool_cancelled", "Tool execution was cancelled.");

      try {
        const result = await execute(args, context);
        return boundToolResult(result, limit);
      } catch (error) {
        if (context.signal.aborted || isAbort(error))
          return failureResult(
            "tool_cancelled",
            "Tool execution was cancelled.",
          );
        return failureResult(
          "tool_failed",
          error instanceof Error ? error.message : "Tool execution failed.",
        );
      }
    },
  };
}

/** Read a required string argument after schema validation has run. */
export function requiredStringArgument(args: JsonObject, name: string): string {
  const value = args[name];
  if (typeof value !== "string") throw new Error(`${name} must be a string.`);
  return value;
}
function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Validate a JSON object against a minimal JSON-schema descriptor. */
export function validateJsonObject(
  value: JsonObject,
  schema: JsonObject,
): string | undefined {
  if (schema.type !== "object") return undefined;
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const name of required) {
    if (typeof name === "string" && !(name in value))
      return `${name} is required.`;
  }
  const properties =
    typeof schema.properties === "object" &&
    schema.properties !== null &&
    !Array.isArray(schema.properties)
      ? (schema.properties as JsonObject)
      : {};
  for (const [name, propertySchema] of Object.entries(properties)) {
    const argument = value[name];
    if (
      argument === undefined ||
      typeof propertySchema !== "object" ||
      propertySchema === null ||
      Array.isArray(propertySchema)
    )
      continue;
    const expected = (propertySchema as JsonObject).type;
    if (typeof expected === "string" && !matchesType(argument, expected))
      return `${name} must be a ${expected}.`;
  }
  return undefined;
}

function matchesType(value: unknown, expected: string): boolean {
  switch (expected) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return (
        typeof value === "object" && value !== null && !Array.isArray(value)
      );
    case "null":
      return value === null;
    default:
      return true;
  }
}
