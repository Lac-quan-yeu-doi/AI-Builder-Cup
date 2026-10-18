import { describe, expect, it, vi } from 'vitest';

import { isCurrentRequestToken } from '@/app/_components/shared/request-token';
import { releaseMonitor } from '@/app/_components/shared/monitor-lifecycle';

describe('UI lifecycle and race adapters', () => {
  it('closes and clears a live monitor during replacement or cleanup', () => {
    const close = vi.fn();

    expect(releaseMonitor({ close })).toBeNull();
    expect(close).toHaveBeenCalledOnce();
    expect(releaseMonitor(null)).toBeNull();
  });

  it('rejects stale async responses while accepting the active request token', () => {
    expect(isCurrentRequestToken(3, 2)).toBe(false);
    expect(isCurrentRequestToken(3, 3)).toBe(true);
  });
});
