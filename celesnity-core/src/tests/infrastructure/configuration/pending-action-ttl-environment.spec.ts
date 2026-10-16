import { validateEnvironment } from '@infrastructure/configuration/environment';

describe('Numeric TTL/rate-limit environment coercion', () => {
  // Without coercion these keys pass through `...input` as raw env strings.
  // `PendingActionUseCases.propose` then does `now.getTime() + ttlMs`, which
  // string-concatenates instead of adding when ttlMs is a string, producing
  // an unparseable date and `RangeError: Invalid time value`.
  it('coerces PENDING_ACTION_TTL_MS to a number', () => {
    expect(validateEnvironment({ PENDING_ACTION_TTL_MS: '86400000' })).toMatchObject({
      PENDING_ACTION_TTL_MS: 86_400_000,
    });
  });

  it('coerces AGENT_WRITE_RATE_WINDOW_MS to a number', () => {
    expect(validateEnvironment({ AGENT_WRITE_RATE_WINDOW_MS: '60000' })).toMatchObject({
      AGENT_WRITE_RATE_WINDOW_MS: 60_000,
    });
  });

  it('coerces AGENT_WRITE_RATE_LIMIT to a number', () => {
    expect(validateEnvironment({ AGENT_WRITE_RATE_LIMIT: '120' })).toMatchObject({
      AGENT_WRITE_RATE_LIMIT: 120,
    });
  });

  it('defaults all three when unset', () => {
    expect(validateEnvironment({})).toMatchObject({
      PENDING_ACTION_TTL_MS: 86_400_000,
      AGENT_WRITE_RATE_WINDOW_MS: 60_000,
      AGENT_WRITE_RATE_LIMIT: 120,
    });
  });

  it('rejects a non-integer value', () => {
    expect(() => validateEnvironment({ PENDING_ACTION_TTL_MS: 'soon' })).toThrow(
      'PENDING_ACTION_TTL_MS must be an integer',
    );
  });
});
