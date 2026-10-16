import type { JsonObject, JsonValue, ToolDefinition } from "@infrastructure/ai";

/**
 * Apply request-schema compatibility rules for a provider while preserving
 * the caller's immutable tool definitions.
 */
export function adaptToolDefinitionsForProvider(
  tools: readonly ToolDefinition[],
  provider: string | undefined,
): ToolDefinition[] {
  if (!isGeminiProvider(provider)) return [...tools];
  return tools.map((tool) => ({
    ...tool,
    function: {
      ...tool.function,
      parameters: stripGeminiSchema(tool.function.parameters),
    },
  }));
}

function isGeminiProvider(provider: string | undefined): boolean {
  const normalized = provider?.toLowerCase();
  return normalized === "gemini" || normalized === "google";
}

function stripGeminiSchema(value: JsonObject): JsonObject {
  return stripGeminiValue(value) as JsonObject;
}

function stripGeminiValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(stripGeminiValue);
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      key === "additionalProperties" ||
      key === "default" ||
      key === "$schema" ||
      key === "format"
    )
      continue;
    result[key] = stripGeminiValue(entry);
  }
  return result;
}
