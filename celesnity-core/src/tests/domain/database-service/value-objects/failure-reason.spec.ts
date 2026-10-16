import {
  FailureReason,
  MAX_FAILURE_REASON_LENGTH,
} from '@domain/database-service/value-objects/failure-reason';
import { VerificationState } from '@domain/database-service/value-objects/connection-value-objects';

/**
 * This normalization was duplicated between the use case's private
 * `failureReason` helper and `sanitizedFailureReason`, with the same fallback and
 * the same truncation in both. The assertions below are the ones both copies
 * satisfied.
 */
describe('FailureReason', () => {
  it('trims', () => {
    expect(FailureReason.from('  connection refused  ').value).toBe('connection refused');
  });

  it.each([[undefined], [''], ['   ']])('substitutes a generic reason for %p', (reason) => {
    expect(FailureReason.from(reason).value).toBe('Database connection verification failed.');
  });

  it('truncates to the shared bound', () => {
    expect(FailureReason.from('a'.repeat(600)).value).toHaveLength(MAX_FAILURE_REASON_LENGTH);
  });

  it('leaves a reason exactly at the bound intact', () => {
    const reason = 'a'.repeat(MAX_FAILURE_REASON_LENGTH);

    expect(FailureReason.from(reason).value).toBe(reason);
  });

  it('produces something VerificationState.failed always accepts', () => {
    // The point of sharing the constant: the two boundaries agreed by
    // coincidence before, and now agree by construction.
    const normalized = FailureReason.from('a'.repeat(10_000));

    expect(() =>
      VerificationState.failed(new Date('2026-08-04T10:00:00.000Z'), normalized.value),
    ).not.toThrow();
  });

  it('renders as its value', () => {
    expect(String(FailureReason.from('boom'))).toBe('boom');
  });
});
