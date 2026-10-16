import {
  VerificationState,
  VerificationStatusValue,
} from '@domain/database-service/value-objects/connection-value-objects';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';

/**
 * Characterization of VerificationState as it behaves today.
 *
 * Note the finding recorded by the "rejects" cases below: `failed` does NOT
 * truncate an over-long reason, it rejects it. Callers truncate to 500
 * characters before they get here (DatabaseServiceUseCases.failureReason and
 * sanitizedFailureReason both do). Task 7 unifies that caller-side truncation
 * into a FailureReason value object; this boundary must keep rejecting.
 */
describe('VerificationState', () => {
  const testedAt = new Date('2026-08-04T10:00:00.000Z');

  describe('untested', () => {
    it('carries no timestamp and no reason', () => {
      const state = VerificationState.untested();

      expect(state.status).toBe('UNTESTED');
      expect(state.lastTestedAt).toBeUndefined();
      expect(state.failureReason).toBeUndefined();
    });
  });

  describe('succeeded', () => {
    it('carries the timestamp and no reason', () => {
      const state = VerificationState.succeeded(testedAt);

      expect(state.status).toBe('SUCCEEDED');
      expect(state.lastTestedAt).toBe(testedAt);
      expect(state.failureReason).toBeUndefined();
    });
  });

  describe('failed', () => {
    it('carries the timestamp and the trimmed reason', () => {
      const state = VerificationState.failed(testedAt, '  connection refused  ');

      expect(state.status).toBe('FAILED');
      expect(state.lastTestedAt).toBe(testedAt);
      expect(state.failureReason).toBe('connection refused');
    });

    it('accepts a reason of exactly 500 characters', () => {
      const reason = 'a'.repeat(500);

      expect(VerificationState.failed(testedAt, reason).failureReason).toBe(reason);
    });

    it('rejects rather than truncates a reason of 501 characters', () => {
      expect(() => VerificationState.failed(testedAt, 'a'.repeat(501))).toThrow(
        'Verification failure reason must not exceed 500 characters.',
      );
    });

    it('rejects a blank reason', () => {
      expect(() => VerificationState.failed(testedAt, '   ')).toThrow(
        'Verification failure reason is required.',
      );
    });

    it('rejects a reason containing a NUL character', () => {
      expect(() => VerificationState.failed(testedAt, 'bad\0reason')).toThrow(
        'Verification failure reason contains an invalid character.',
      );
    });

    it('raises a ConnectionError', () => {
      expect(() => VerificationState.failed(testedAt, '')).toThrow(ConnectionError);
    });
  });

  describe('rehydrate', () => {
    it('ignores the timestamp and reason for an UNTESTED status', () => {
      const state = VerificationState.rehydrate(
        VerificationStatusValue.UNTESTED,
        testedAt,
        'ignored',
      );

      expect(state.status).toBe('UNTESTED');
      expect(state.lastTestedAt).toBeUndefined();
      expect(state.failureReason).toBeUndefined();
    });

    it('rebuilds a SUCCEEDED state', () => {
      const state = VerificationState.rehydrate(VerificationStatusValue.SUCCEEDED, testedAt);

      expect(state.status).toBe('SUCCEEDED');
      expect(state.lastTestedAt).toBe(testedAt);
      expect(state.failureReason).toBeUndefined();
    });

    it('rebuilds a FAILED state', () => {
      const state = VerificationState.rehydrate(
        VerificationStatusValue.FAILED,
        testedAt,
        'connection refused',
      );

      expect(state.status).toBe('FAILED');
      expect(state.failureReason).toBe('connection refused');
    });

    it('substitutes a default reason for a FAILED state stored without one', () => {
      const state = VerificationState.rehydrate(VerificationStatusValue.FAILED, testedAt);

      expect(state.failureReason).toBe('Connection verification failed.');
    });

    it.each([VerificationStatusValue.SUCCEEDED, VerificationStatusValue.FAILED])(
      'rejects a %s status with no timestamp',
      (status) => {
        expect(() => VerificationState.rehydrate(status)).toThrow(
          'A tested connection requires a verification timestamp.',
        );
      },
    );

    it('does not require a timestamp for UNTESTED', () => {
      expect(() => VerificationState.rehydrate(VerificationStatusValue.UNTESTED)).not.toThrow();
    });
  });
});
