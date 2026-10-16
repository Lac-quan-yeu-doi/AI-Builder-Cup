import type { JsonObject, JsonValue } from "@domain/shared";

export function validateArguments(
  schema: JsonObject,
  value: JsonValue,
): string | undefined {
  if (schema.type !== "object" || !isRecord(value))
    return "arguments must be an object.";

  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const name of required) {
    if (typeof name === "string" && !(name in value))
      return `${name} is required.`;
  }

  const properties = isRecord(schema.properties) ? schema.properties : {};
  for (const [name, propertySchema] of Object.entries(properties)) {
    const argument = value[name];
    if (
      argument === undefined ||
      propertySchema === undefined ||
      !isRecord(propertySchema)
    )
      continue;
    const expected = propertySchema.type;
    if (typeof expected === "string" && !matchesType(argument, expected)) {
      return `${name} must be a ${expected}.`;
    }
  }
  return undefined;
}

function matchesType(value: JsonValue, expected: string): boolean {
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
      return isRecord(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
