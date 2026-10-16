import { validateEnvironment } from '@infrastructure/configuration/environment';

describe('LOCAL_AUTH_BYPASS validation', () => {
  it('refuses to boot a production process with the bypass enabled', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        LOCAL_AUTH_BYPASS: 'true',
        IDENTITY_PLATFORM_PROJECT_ID: 'project',
        AUDIT_HASH_KEY: 'a'.repeat(32),
        CONNECTION_CREDENTIAL_KEYS: 'v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      }),
    ).toThrow('LOCAL_AUTH_BYPASS must not be enabled in production');
  });

  it('uses a stable local-only default bypass subject', () => {
    const result = validateEnvironment({
      LOCAL_AUTH_BYPASS: 'true',
    });

    expect(result.LOCAL_AUTH_BYPASS).toBe(true);
    expect(result.LOCAL_AUTH_BYPASS_SUBJECT).toBe('local-developer');
    expect(result.LOCAL_AUTH_BYPASS_TOKEN).toBe('local-development-session');
  });

  it('leaves the bypass off by default', () => {
    expect(validateEnvironment({}).LOCAL_AUTH_BYPASS).toBe(false);
  });
});
