/**
 * A tool call, as something a person can read.
 *
 * The agent names its tools the way the MCP wire names them:
 * `mcp__trino__run_query`, `mcp__plant_model__list_sites`. The transcript
 * printed those verbatim, so the reasoning panel read as a stack trace.
 *
 * This is presentation, not translation. The identifier is the agent's, and the
 * i18n rule keeps technical identifiers untranslated, so nothing here is
 * looked up in a dictionary: the underscores become spaces and the server stays
 * beside the action as its own word. `raw` goes on the element's `title`, so
 * the wire name is still one hover away when somebody is debugging.
 */
export interface ToolName {
  /** The action, in words. `Run query`. */
  readonly action: string;
  /** Which server answered, when the name says. `trino`. */
  readonly server: string | null;
  /** Exactly what the agent called it. */
  readonly raw: string;
}

const MCP_PATTERN = /^mcp__(?<server>[^_]+(?:_[^_]+)*?)__(?<action>.+)$/u;

function humanise(identifier: string): string {
  const words = identifier.replaceAll('_', ' ').trim();
  return words.length === 0 ? identifier : words.charAt(0).toUpperCase() + words.slice(1);
}

export function readToolName(raw: string): ToolName {
  const match = MCP_PATTERN.exec(raw);
  if (match?.groups === undefined) {
    return { action: humanise(raw), server: null, raw };
  }
  return {
    action: humanise(match.groups['action'] ?? raw),
    server: (match.groups['server'] ?? '').replaceAll('_', ' ') || null,
    raw,
  };
}
