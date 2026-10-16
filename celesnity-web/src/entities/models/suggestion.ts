const SUGGESTION_TAG_PATTERN = /<suggestion>([^<]+)<\/suggestion>/g;

/**
 * Scans an assistant reply for `<suggestion>` tags emitted per
 * `chat-assistant.yaml`'s "Suggesting next steps" instructions,
 * de-duplicated — a message should not offer the same next step twice.
 */
export function extractSuggestions(content: string): readonly string[] {
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const match of content.matchAll(SUGGESTION_TAG_PATTERN)) {
    const text = match[1]?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    suggestions.push(text);
  }
  return suggestions;
}

/**
 * A list item left holding nothing. The assistant usually writes its next
 * steps as a bullet list with one `<suggestion>` per item, so removing the
 * tags leaves the markers behind and the reply renders a run of empty
 * bullets under the heading.
 */
const EMPTY_LIST_ITEM_PATTERN = /^[ \t]*(?:[-*+\u2022]|\d+[.)])[ \t]*$/gm;

/**
 * The line that introduces the suggestions — "Suggested next steps:", a
 * heading, a lead-in ending in a colon. It reads correctly above the chips and
 * reads as a bug without them, so it is dropped only when there are no chips.
 */
const DANGLING_LEAD_IN =
  /(?:^|\n)[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?(?:[^\n]*:|(?:suggested[ \t]+)?next[ \t]+steps?|(?:g\u1ee3i[ \t]*\u00fd[ \t]*)?b\u01b0\u1edbc[ \t]+ti\u1ebfp[ \t]+theo)(?:\*\*)?[ \t]*$/iu;

/**
 * Removes `<suggestion>` tags from the message body before it reaches
 * `ChatMarkdown` — they render as chips instead (see
 * `chat-suggestions.tsx`), not as literal tag text in the prose.
 * Collapses the blank lines and orphaned bullets a removed tag leaves behind.
 *
 * `chipsRendered` is false for every reply but the newest, which is the only
 * one offered chips. Those replies also lose the line that introduced the
 * suggestions: left alone it trails off into nothing, which is how a finished
 * answer came to end on a bare "Suggested next steps:".
 */
export function stripSuggestionTags(content: string, chipsRendered = true): string {
  const stripped = content
    .replace(SUGGESTION_TAG_PATTERN, '')
    .replace(EMPTY_LIST_ITEM_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  if (chipsRendered) return stripped;
  // Twice: a lead-in of its own may sit under a heading that introduced it.
  return dropDanglingLeadIn(dropDanglingLeadIn(stripped));
}

function dropDanglingLeadIn(content: string): string {
  return content.replace(DANGLING_LEAD_IN, '').trimEnd();
}

/**
 * Whether the prose already ends on the line that introduces the suggestions.
 * The list rendered under it then needs no heading of its own: two lead-ins
 * in a row read as a stutter.
 */
export function endsWithLeadIn(content: string): boolean {
  return DANGLING_LEAD_IN.test(content);
}
