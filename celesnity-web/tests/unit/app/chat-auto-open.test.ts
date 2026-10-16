import { describe, expect, it } from 'vitest';

import {
  decideAutoOpen,
  type AutoOpenMemory,
} from '@/app/(workspace)/chat/_components/stage/auto-open';

const empty: AutoOpenMemory = { session: null, ids: new Set() };

describe('decideAutoOpen', () => {
  it('opens nothing when a conversation is first shown', () => {
    /* Six stored charts are six cards, not six panes. */
    const decision = decideAutoOpen(empty, 's1', ['block:a', 'block:b']);

    expect(decision.open).toEqual([]);
    expect([...decision.memory.ids]).toEqual(['block:a', 'block:b']);
    expect(decision.memory.session).toBe('s1');
  });

  it('opens an artifact that arrives while the conversation is open', () => {
    const hydrated = decideAutoOpen(empty, 's1', ['block:a']).memory;
    const decision = decideAutoOpen(hydrated, 's1', ['block:a', 'block:b']);

    expect(decision.open).toEqual(['block:b']);
  });

  it('opens several arrivals in the order they appeared', () => {
    const hydrated = decideAutoOpen(empty, 's1', []).memory;
    const decision = decideAutoOpen(hydrated, 's1', ['block:a', 'block:b', 'block:c']);

    expect(decision.open).toEqual(['block:a', 'block:b', 'block:c']);
  });

  it('never reopens a pane that was closed', () => {
    /*
     * The memory is of every id acted on, never of what is currently open. A
     * render that happens after somebody closes the pane must not put it back,
     * which is the failure mode that would make this feature unbearable.
     */
    const hydrated = decideAutoOpen(empty, 's1', []).memory;
    const first = decideAutoOpen(hydrated, 's1', ['block:a']);
    expect(first.open).toEqual(['block:a']);

    const afterClose = decideAutoOpen(first.memory, 's1', ['block:a']);
    expect(afterClose.open).toEqual([]);
  });

  it('starts over when the conversation changes, without opening anything', () => {
    const inS1 = decideAutoOpen(decideAutoOpen(empty, 's1', []).memory, 's1', ['block:a']);
    const switched = decideAutoOpen(inS1.memory, 's2', ['block:x', 'block:y']);

    expect(switched.open).toEqual([]);
    expect(switched.memory.session).toBe('s2');
    /* The previous conversation's ids are gone, so coming back re-seeds. */
    expect([...switched.memory.ids]).toEqual(['block:x', 'block:y']);
  });

  it('treats the landing screen as its own conversation', () => {
    const decision = decideAutoOpen(empty, null, []);
    expect(decision.open).toEqual([]);
    expect(decision.memory.session).toBeNull();
  });
});
