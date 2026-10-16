import { describe, expect, it } from 'vitest';
import { sanitizeVerificationMessage } from '@/src/entities/models/connection';
import {
  describeFailure,
  executionStatusLabel,
  isCancellableExecution,
  isTerminalExecution,
} from '@/src/entities/models/execution';
import { looksReadOnly } from '@/src/entities/models/query';

describe('entity behavior', () => {
  it('redacts credentials from connection verification messages', () => {
    expect(sanitizeVerificationMessage('postgres://user:secret@db:5432/app')).toBe(
      'PostgreSQL endpoint [redacted]',
    );
  });
  it.each([
    { status: 'queued', cancellable: true, terminal: false, label: 'Queued' },
    { status: 'preparing', cancellable: true, terminal: false, label: 'Preparing' },
    { status: 'submitted', cancellable: true, terminal: false, label: 'Submitted' },
    { status: 'running', cancellable: true, terminal: false, label: 'Running' },
    { status: 'cancelling', cancellable: false, terminal: false, label: 'Cancelling' },
    { status: 'succeeded', cancellable: false, terminal: true, label: 'Succeeded' },
    { status: 'failed', cancellable: false, terminal: true, label: 'Failed' },
    { status: 'cancelled', cancellable: false, terminal: true, label: 'Cancelled' },
    { status: 'timed_out', cancellable: false, terminal: true, label: 'Timed out' },
  ] as const)('preserves the $status execution lifecycle rules and label', (testCase) => {
    expect(isCancellableExecution(testCase.status)).toBe(testCase.cancellable);
    expect(isTerminalExecution(testCase.status)).toBe(testCase.terminal);
    expect(executionStatusLabel(testCase.status)).toBe(testCase.label);
  });
  it('sanitizes and separates an execution failure', () => {
    expect(describeFailure('Boom\npassword=secret')).toEqual({
      headline: 'Boom',
      detail: 'password=[redacted]',
    });
  });
  it('recognizes read-only SQL after leading comments', () => {
    expect(looksReadOnly('-- note\nWITH source AS (SELECT 1) SELECT * FROM source')).toBe(true);
    expect(looksReadOnly('DELETE FROM source')).toBe(false);
  });
});
