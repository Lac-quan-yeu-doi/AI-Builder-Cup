import { validateEnvironment } from '@infrastructure/configuration/environment';

describe('local Trino environment', () => {
  it('uses the non-conflicting local Trino host port by default', () => {
    expect(validateEnvironment({})).toMatchObject({
      TRINO_URL: 'http://localhost:18082',
    });
  });
});
