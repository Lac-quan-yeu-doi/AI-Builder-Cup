import { redactSecrets } from "./secret-redaction.js";

export interface ToolActionSummaryInput {
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly readOnly: boolean;
  readonly destructive: boolean;
}

export interface ToolActionResultInput {
  readonly success: boolean;
  readonly output: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ToolActionSummary {
  readonly tool: string;
  readonly status: "success" | "error";
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly argumentSummary: Readonly<Record<string, unknown>>;
  readonly resultSize: number;
  readonly durationMs?: number;
}

export function summarizeToolAction(
  call: ToolActionSummaryInput,
  result: ToolActionResultInput,
): ToolActionSummary {
  const metadata = result.metadata ?? {};
  const durationMs = metadata.duration_ms;
  return {
    tool: call.name,
    status: result.success ? "success" : "error",
    readOnly: call.readOnly,
    destructive: call.destructive,
    argumentSummary: redactSecrets(
      Object.fromEntries(
        Object.entries(call.arguments).map(([key, value]) => [
          key,
          summaryValue(value),
        ]),
      ),
    ),
    resultSize: result.output.length,
    ...(typeof durationMs === "number" ? { durationMs } : {}),
  };
}

function summaryValue(value: unknown): unknown {
  if (typeof value === "string")
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  if (Array.isArray(value)) return { type: "array", count: value.length };
  if (typeof value === "object" && value !== null)
    return { type: "object", keys: Object.keys(value).slice(0, 20) };
  return value;
}
