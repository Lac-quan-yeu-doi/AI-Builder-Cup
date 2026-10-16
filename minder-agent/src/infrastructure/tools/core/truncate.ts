export const DEFAULT_TOOL_OUTPUT_LIMIT = 10_000;
export const OUTPUT_TRUNCATION_MARKER = "\n... output truncated ...\n";

export function truncateOutput(
  value: string,
  limit = DEFAULT_TOOL_OUTPUT_LIMIT,
): string {
  if (value.length <= limit) return value;
  if (limit <= OUTPUT_TRUNCATION_MARKER.length)
    return OUTPUT_TRUNCATION_MARKER.slice(0, limit);
  return (
    value.slice(0, limit - OUTPUT_TRUNCATION_MARKER.length) +
    OUTPUT_TRUNCATION_MARKER
  );
}
