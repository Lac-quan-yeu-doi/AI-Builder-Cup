import type {
  AskUserRequest,
  JsonObject,
  QuestionOption,
} from "@domain/shared";

export const ASK_USER_MAX_OPTIONS = 8;

export function buildAskUserRequest(
  args: JsonObject,
): AskUserRequest | undefined {
  const question =
    typeof args.question === "string" ? args.question.trim() : "";
  if (!question) return undefined;

  const options: QuestionOption[] = [];
  const labels = new Set<string>();
  const rawOptions: readonly unknown[] = Array.isArray(args.options)
    ? args.options
    : [];
  for (const raw of rawOptions) {
    const normalized = normalizeOption(raw);
    if (!normalized || labels.has(normalized.label)) continue;
    labels.add(normalized.label);
    options.push(normalized);
    if (options.length === ASK_USER_MAX_OPTIONS) break;
  }

  return {
    version: 1,
    kind: options.length > 0 ? "choice" : "free_text",
    question,
    options,
    allow_other:
      typeof args.allow_other === "boolean" ? args.allow_other : true,
  };
}

function normalizeOption(value: unknown): QuestionOption | undefined {
  const label =
    typeof value === "string"
      ? value.trim()
      : isRecord(value) && typeof value.label === "string"
        ? value.label.trim()
        : "";
  if (!label) return undefined;

  const description =
    isRecord(value) && typeof value.description === "string"
      ? value.description.trim()
      : "";
  return description ? { label, description } : { label };
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
