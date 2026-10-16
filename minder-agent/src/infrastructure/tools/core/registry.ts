import type { ToolDefinition } from "@infrastructure/ai";
import type { JsonObject, JsonValue } from "@domain/shared";
import { DEFAULT_TOOL_OUTPUT_LIMIT, truncateOutput } from "./truncate.js";
import type { MinderTool, ToolContext, ToolResult } from "./types.js";
import { validateArguments } from "./validation.js";

export class ToolRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolRegistryError";
  }
}

export interface ToolPolicyDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface ToolRegistryOptions {
  readonly policy?: (input: {
    readonly name: string;
    readonly arguments: JsonObject;
    readonly context: ToolContext;
  }) => Promise<ToolPolicyDecision>;
  readonly redact?: (output: string) => string;
}

export class ToolRegistry {
  private readonly tools = new Map<string, MinderTool>();
  private readonly policy: ToolRegistryOptions["policy"];
  private readonly redact: (output: string) => string;

  constructor(tools: readonly MinderTool[], options: ToolRegistryOptions = {}) {
    for (const tool of tools) {
      if (this.tools.has(tool.name))
        throw new ToolRegistryError(`Duplicate tool name: ${tool.name}`);
      this.tools.set(tool.name, tool);
    }
    this.policy = options.policy;
    this.redact = options.redact ?? redactSecretOutput;
  }

  get(name: string): MinderTool | undefined {
    return this.tools.get(name);
  }

  all(): readonly MinderTool[] {
    return [...this.tools.values()];
  }

  withTools(tools: readonly MinderTool[]): ToolRegistry {
    return new ToolRegistry(tools, {
      ...(this.policy === undefined ? {} : { policy: this.policy }),
      redact: this.redact,
    });
  }

  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: structuredClone(tool.parameters),
      },
    }));
  }

  async execute(
    name: string,
    arguments_: JsonValue,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return this.failure(`Unknown tool: ${name}.`);
    const validationError = validateArguments(tool.parameters, arguments_);
    if (validationError) return this.failure(validationError);
    if (!tool.execute) return this.failure(`Tool ${name} cannot be executed.`);

    const validArguments = arguments_ as JsonObject;
    if (context.governance) {
      const decision = await context.governance.check({
        name,
        arguments: validArguments,
        readOnly: tool.readOnly ?? false,
      });
      if (!decision.allowed)
        return this.failure(decision.reason ?? `Tool ${name} is not allowed.`, {
          ...(decision.code === undefined ? {} : { error_code: decision.code }),
        });
    }
    if (this.policy) {
      const decision = await this.policy({
        name,
        arguments: validArguments,
        context,
      });
      if (!decision.allowed)
        return this.failure(decision.reason ?? `Tool ${name} is not allowed.`);
    }

    try {
      const result = await tool.execute(validArguments, context);
      const safeResult = {
        ...result,
        output: this.limitAndRedact(result.output, tool.outputLimit),
        metadata: redactJsonObject(result.metadata),
      };
      try {
        await context.onToolResult?.({
          name: tool.name,
          arguments: validArguments,
          result: safeResult,
          readOnly: tool.readOnly ?? false,
          destructive: tool.destructive ?? false,
        });
      } catch {
        // Observability is fail-open and cannot turn a successful tool call into a failure.
      }
      return safeResult;
    } catch (error) {
      return this.failure(
        error instanceof Error ? error.message : `Tool ${name} failed.`,
      );
    }
  }

  private failure(
    output: string,
    metadata: Record<string, JsonValue> = {},
  ): ToolResult {
    return {
      success: false,
      output: this.limitAndRedact(output),
      metadata,
    };
  }

  private limitAndRedact(
    output: string,
    limit = DEFAULT_TOOL_OUTPUT_LIMIT,
  ): string {
    return truncateOutput(this.redact(output), limit);
  }
}

function redactSecretOutput(output: string): string {
  return output
    .replace(/Bearer\s+[A-Za-z0-9_.-]{20,}/gu, "[REDACTED]")
    .replace(/(?:password|passwd|pass)\s*=\s*\S+/giu, "[REDACTED]")
    .replace(/(?:api[_-]?key|secret|token)\s*[:=]\s*\S+/giu, "[REDACTED]")
    .replace(/(?:sk-ant-|gsk_|ghp_)[A-Za-z0-9_-]{20,}/gu, "[REDACTED]");
}

function redactJsonObject(
  value: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      redactJsonValue(entry, key),
    ]),
  );
}

function redactJsonValue(value: JsonValue, key?: string): JsonValue {
  if (typeof value === "string") {
    if (
      key !== undefined &&
      /(?:password|passwd|secret|token|api[_-]?key|credential)/iu.test(key)
    )
      return "[REDACTED]";
    return redactSecretOutput(value);
  }
  if (Array.isArray(value))
    return (value as readonly JsonValue[]).map((entry) =>
      redactJsonValue(entry),
    );
  if (typeof value === "object" && value !== null && !Array.isArray(value))
    return redactJsonObject(value as Record<string, JsonValue>);
  return value;
}
