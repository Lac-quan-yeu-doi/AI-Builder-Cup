import { validateEnvironment } from '@infrastructure/configuration/environment';

describe('local authentication environment safety', () => {
  it('accepts an explicit local mode with a strong signing key', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'development',
        CELESNITY_AUTH_MODE: 'local-development',
        LOCAL_DEV_AUTH_SIGNING_KEY: 'a'.repeat(32),
      }),
    ).toMatchObject({
      CELESNITY_AUTH_MODE: 'local-development',
      LOCAL_DEV_AUTH_SIGNING_KEY: 'a'.repeat(32),
    });
  });

  it('rejects local mode in production before any service starts', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        CELESNITY_AUTH_MODE: 'local-development',
        LOCAL_DEV_AUTH_SIGNING_KEY: 'a'.repeat(32),
      }),
    ).toThrow('forbidden in production');
  });

  it('rejects a weak or absent local signing key', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        CELESNITY_AUTH_MODE: 'local-development',
      }),
    ).toThrow('at least 32 characters');
  });
});
