// @vitest-environment jsdom

import { createElement } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CurrentUserProvider, useCurrentUserId } from '@/app/_providers/current-user-provider';

describe('CurrentUserProvider / useCurrentUserId', () => {
  it('returns the userId given to the provider', () => {
    const { result } = renderHook(() => useCurrentUserId(), {
      wrapper: ({ children }) =>
        createElement(CurrentUserProvider, { userId: 'user-abc' }, children),
    });
    expect(result.current).toBe('user-abc');
  });

  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useCurrentUserId())).toThrow(
      'useCurrentUserId must be used within a CurrentUserProvider',
    );
  });
});
