import { describe, expect, it } from 'vitest';

import { presentMessageBlock } from '@/src/interface-adapters/presenters/message-block.presenter';
import type { MessageBlock } from '@/src/entities/models/message-block';

describe('presentMessageBlock', () => {
  it('maps every entity field onto the view model', () => {
    const block: MessageBlock = {
      id: 'block-1',
      roomId: 'room-1',
      runId: 'run-1',
      blockType: 'chart',
      version: 1,
      payload: { title: 't' },
      fallbackText: 'x',
      publishedAt: '2026-08-18T00:00:00.000Z',
    };

    // `publishedAt` is carried, not dropped: it is the only ordering the UI
    // has for blocks restored from history, since the agent's transcript has
    // no timestamps of its own.
    expect(presentMessageBlock(block)).toEqual({
      id: 'block-1',
      runId: 'run-1',
      blockType: 'chart',
      payload: { title: 't' },
      fallbackText: 'x',
      publishedAt: '2026-08-18T00:00:00.000Z',
    });
  });

  it('returns a frozen view model so a caller cannot mutate it', () => {
    const view = presentMessageBlock({
      id: 'block-1',
      roomId: 'room-1',
      runId: null,
      blockType: 'text',
      version: 1,
      payload: {},
      fallbackText: 'x',
      publishedAt: '2026-08-18T00:00:00.000Z',
    });
    expect(Object.isFrozen(view)).toBe(true);
  });
});
