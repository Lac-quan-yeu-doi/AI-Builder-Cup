import { validateEnvironment } from '@infrastructure/configuration/environment';

describe('canonical chart execution environment', () => {
  it('provides bounded transient preview/run defaults', () => {
    expect(validateEnvironment({})).toMatchObject({
      CHART_QUERY_TIMEOUT_MS: 60_000,
      CHART_PREVIEW_MAX_ROWS: 1_000,
      CHART_RUN_MAX_ROWS: 10_000,
      CHART_PREVIEW_MAX_BYTES: 10 * 1024 * 1024,
      CHART_RUN_MAX_BYTES: 10 * 1024 * 1024,
    });
  });

  it('coerces chart limits supplied by deployment configuration', () => {
    expect(
      validateEnvironment({
        CHART_QUERY_TIMEOUT_MS: '120000',
        CHART_PREVIEW_MAX_ROWS: '50',
        CHART_RUN_MAX_ROWS: '500',
        CHART_PREVIEW_MAX_BYTES: '1000',
        CHART_RUN_MAX_BYTES: '2000',
      }),
    ).toMatchObject({
      CHART_QUERY_TIMEOUT_MS: 120_000,
      CHART_PREVIEW_MAX_ROWS: 50,
      CHART_RUN_MAX_ROWS: 500,
      CHART_PREVIEW_MAX_BYTES: 1_000,
      CHART_RUN_MAX_BYTES: 2_000,
    });
  });

  it('rejects a preview cap greater than the saved-run cap', () => {
    expect(() =>
      validateEnvironment({ CHART_PREVIEW_MAX_ROWS: '101', CHART_RUN_MAX_ROWS: '100' }),
    ).toThrow('CHART_PREVIEW_MAX_ROWS must not exceed CHART_RUN_MAX_ROWS');
    expect(() =>
      validateEnvironment({ CHART_PREVIEW_MAX_BYTES: '101', CHART_RUN_MAX_BYTES: '100' }),
    ).toThrow('CHART_PREVIEW_MAX_BYTES must not exceed CHART_RUN_MAX_BYTES');
  });

  it('rejects non-positive chart timeout or caps', () => {
    expect(() => validateEnvironment({ CHART_QUERY_TIMEOUT_MS: '0' })).toThrow(
      'CHART_QUERY_TIMEOUT_MS must be an integer between 1000 and 3600000',
    );
    expect(() => validateEnvironment({ CHART_RUN_MAX_ROWS: '0' })).toThrow(
      'CHART_RUN_MAX_ROWS must be an integer between 1 and 1000000',
    );
  });
});
