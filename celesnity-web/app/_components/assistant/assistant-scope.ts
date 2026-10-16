/**
 * What the assistant can see on this surface, stated in the panel rather than
 * folded silently into the prompt.
 *
 * A chip is derived from the route — the workflow being edited, the site whose
 * model is open, the database whose tables are listed. Removing one narrows
 * what the agent reads, which is why `onScopeRemove` and not a tooltip.
 */
export interface AssistantScopeChip {
  readonly id: string;
  /** Short kind marker: `workflow`, `site`, `database`. Rendered before the value. */
  readonly kind: string;
  readonly value: string;
  /** Route-derived chips are fixed; a chip the visitor added can come off. */
  readonly removable?: boolean;
}

/** A starter shown on an empty panel, written against the object in scope. */
export interface AssistantStarter {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
}
