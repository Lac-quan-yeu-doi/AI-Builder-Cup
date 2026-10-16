import type { ToolActivity } from './types';
import { textAnchorOf } from './text-anchor';

export interface ToolEventLike {
  readonly id: string;
  readonly name: string | null;
  readonly status: ToolActivity['status'];
  readonly arguments?: Readonly<Record<string, unknown>>;
}

/**
 * Folds one tool event into a turn's activity list.
 *
 * The first event for a call pins it to the prose streamed so far (see
 * `text-anchor.ts`); later events for the same call — finished, result, or the
 * same start replayed by a second stream — keep that pin and only update the
 * status, so the card drawn for the call cannot drift once it has a place.
 */
export function applyToolEvent(
  existing: readonly ToolActivity[],
  event: ToolEventLike,
  content: string,
): ToolActivity[] {
  const next = [...existing];
  const index = next.findIndex((tool) => tool.id === event.id);
  const known = next[index];
  const activity: ToolActivity = {
    id: event.id,
    name: event.name ?? known?.name ?? 'tool',
    status: event.status,
    arguments: event.arguments ?? known?.arguments,
    textOffset: known?.textOffset ?? content.length,
    textAnchor: known?.textAnchor ?? textAnchorOf(content),
  };
  if (index >= 0) next[index] = activity;
  else next.push(activity);
  return next;
}
