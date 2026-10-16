import type { GlobalSkillInput } from "./skill-service.js";

export function generateSkillIndex(
  skills: readonly GlobalSkillInput[],
): string | undefined {
  const topLevel = skills.filter(
    (s) => !s.name.includes("--") && s.namespace.startsWith("plugins."),
  );
  if (topLevel.length === 0) return undefined;

  const lines = topLevel.map(
    (s) => `- ${s.name}: ${s.description ?? "(no description)"}`,
  );

  return [
    "## Connected third-party services",
    'Call InvokeSkill("{name}") to load full instructions before working with any service below.',
    ...lines,
    "",
    "NOTE: Minder's internal document tools (list_documents, get_document_text) are NOT part of any third-party service above. Do not include their capabilities when describing what you can do with Google Drive or other connected services.",
  ].join("\n");
}
