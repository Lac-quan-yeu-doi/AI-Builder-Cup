import { validateEnvironment } from '@infrastructure/configuration/environment';

describe('data workflow worker environment', () => {
  it('coerces bounded worker configuration with safe defaults', () => {
    expect(
      validateEnvironment({
        DATA_WORKFLOW_CLAIM_BATCH_SIZE: '6',
        DATA_WORKFLOW_LEASE_MS: '45000',
      }),
    ).toMatchObject({
      DATA_WORKFLOW_WORKER_POLL_INTERVAL_MS: 1_000,
      DATA_WORKFLOW_CLAIM_BATCH_SIZE: 6,
      DATA_WORKFLOW_LEASE_MS: 45_000,
      DATA_WORKFLOW_RECONCILIATION_INTERVAL_MS: 5_000,
    });
  });

  it('rejects a lease shorter than the configured lower bound', () => {
    expect(() => validateEnvironment({ DATA_WORKFLOW_LEASE_MS: '10' })).toThrow(
      'DATA_WORKFLOW_LEASE_MS must be an integer between 1000 and 900000',
    );
  });
});
