export interface AutoOpenMemory {
  /** The conversation these ids belong to. */
  readonly session: string | null;
  /** Artifact ids already acted on, opened or deliberately skipped. */
  readonly ids: ReadonlySet<string>;
}

export interface AutoOpenDecision {
  readonly memory: AutoOpenMemory;
  /** Artifact ids to open now, in the order they appeared. */
  readonly open: readonly string[];
}

/**
 * Which artifacts should open a pane without being asked.
 *
 * The design system's first rule is that the stage appears when the agent has
 * produced something worth a pane, so an answer that waits for a click sits one
 * step further away than the question did. The card stays in the transcript
 * either way, as the index.
 *
 * Two rules keep that from becoming a nuisance, and both are the reason this is
 * a function rather than a line in an effect:
 *
 * - **A pane somebody closed stays closed.** The memory is of every id acted
 *   on, never of what is currently open, so closing a pane cannot make the next
 *   render put it back.
 * - **A stored conversation does not burst open.** Switching to a chat with six
 *   old charts in it shows six cards, not six panes. Everything already present
 *   when a conversation arrives is marked seen without opening.
 */
export function decideAutoOpen(
  memory: AutoOpenMemory,
  session: string | null,
  present: Iterable<string>,
): AutoOpenDecision {
  const ids = [...present];

  if (memory.session !== session) {
    return { memory: { session, ids: new Set(ids) }, open: [] };
  }

  const next = new Set(memory.ids);
  const open: string[] = [];
  for (const id of ids) {
    if (next.has(id)) continue;
    next.add(id);
    open.push(id);
  }

  return { memory: { session, ids: next }, open };
}
