import { ConfigService } from '@nestjs/config';

import { redpandaTlsConfiguration } from '@infrastructure/messaging/redpanda-tls';

describe('redpandaTlsConfiguration', () => {
  it('disables TLS when the environment disables it', () => {
    const config = new ConfigService({ REDPANDA_TLS_ENABLED: false });

    expect(redpandaTlsConfiguration(config)).toBe(false);
  });

  it('trusts the configured Redpanda CA when TLS is enabled', () => {
    const config = new ConfigService({
      REDPANDA_TLS_ENABLED: true,
      REDPANDA_CA_CERT: '-----BEGIN CERTIFICATE-----\nproduction-ca\n-----END CERTIFICATE-----',
    });

    expect(redpandaTlsConfiguration(config)).toEqual({
      ca: ['-----BEGIN CERTIFICATE-----\nproduction-ca\n-----END CERTIFICATE-----'],
    });
  });

  it('fails closed when TLS is enabled without a CA', () => {
    const config = new ConfigService({
      REDPANDA_TLS_ENABLED: true,
      REDPANDA_CA_CERT: '   ',
    });

    expect(() => redpandaTlsConfiguration(config)).toThrow(
      'REDPANDA_CA_CERT is required when REDPANDA_TLS_ENABLED is true',
    );
  });
});
