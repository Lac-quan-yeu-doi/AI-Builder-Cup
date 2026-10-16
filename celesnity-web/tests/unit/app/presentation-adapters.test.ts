import { describe, expect, it } from 'vitest';

import { contextualErrorMessage, errorMessage } from '@/app/_components/shared/error-message';
import { queryMonitorChannel } from '@/app/(workspace)/sql/_components/query-monitor-channel';
import { ConflictError, RemoteServiceError } from '@/src/entities/errors/application-errors';

describe('framework presentation adapters', () => {
  it('keeps application error details and falls back for non-errors', () => {
    expect(errorMessage(new RemoteServiceError('Core API unavailable'), 'Try again.')).toBe(
      'Core API unavailable',
    );
    expect(errorMessage({ detail: 'internal transport detail' }, 'Try again.')).toBe('Try again.');
  });

  it('shows public application messages but hides native transport details contextually', () => {
    expect(
      contextualErrorMessage(new ConflictError('Execution is already terminal.'), 'Try again.'),
    ).toBe('Execution is already terminal.');
    expect(
      contextualErrorMessage(
        new RemoteServiceError('Core API unavailable', { exposeMessage: true }),
        'Try again.',
      ),
    ).toBe('Core API unavailable');
    expect(contextualErrorMessage(new RemoteServiceError('Failed to fetch'), 'Try again.')).toBe(
      'Try again.',
    );
    expect(
      contextualErrorMessage(
        new RemoteServiceError('Failed to fetch', { exposeMessage: false }),
        'The execution could not be loaded.',
      ),
    ).toBe('The execution could not be loaded.');
    expect(contextualErrorMessage(new TypeError('Failed to fetch'), 'Try again.')).toBe(
      'Try again.',
    );
  });

  it('preserves the existing streaming and polling channel labels', () => {
    expect(queryMonitorChannel('streaming')).toBe('sse');
    expect(queryMonitorChannel('polling')).toBe('polling');
  });
});
