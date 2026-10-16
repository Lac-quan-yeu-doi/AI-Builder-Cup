import { generateKeyPairSync } from 'node:crypto';

import { validateEnvironment } from '@infrastructure/configuration/environment';

describe('Minder principal assertion environment', () => {
  const privateKeyPem = generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'pem', type: 'pkcs8' })
    .toString();

  it('keeps the Core-only signing configuration and an explicit bounded TTL', () => {
    expect(
      validateEnvironment({
        MINDER_ASSERTION_PRIVATE_KEY_PEM: privateKeyPem,
        MINDER_ASSERTION_KEY_ID: 'core-test-2026',
        MINDER_ASSERTION_TTL_SECONDS: '45',
      }),
    ).toMatchObject({
      MINDER_ASSERTION_PRIVATE_KEY_PEM: privateKeyPem.trim(),
      MINDER_ASSERTION_KEY_ID: 'core-test-2026',
      MINDER_ASSERTION_TTL_SECONDS: 45,
    });
  });

  it('rejects an assertion lifetime beyond the one-minute replay window', () => {
    expect(() =>
      validateEnvironment({
        MINDER_ASSERTION_PRIVATE_KEY_PEM: privateKeyPem,
        MINDER_ASSERTION_KEY_ID: 'core-test-2026',
        MINDER_ASSERTION_TTL_SECONDS: '61',
      }),
    ).toThrow('MINDER_ASSERTION_TTL_SECONDS');
  });
});
