import type { ConfigService } from '@nestjs/config';
import type { KafkaConfig } from 'kafkajs';

export function redpandaTlsConfiguration(config: ConfigService): KafkaConfig['ssl'] {
  const tlsEnabled = config.getOrThrow<boolean>('REDPANDA_TLS_ENABLED');
  if (!tlsEnabled) return false;

  const caCertificate = config.get<string>('REDPANDA_CA_CERT', '').trim();
  if (caCertificate === '') {
    throw new Error('REDPANDA_CA_CERT is required when REDPANDA_TLS_ENABLED is true');
  }

  return { ca: [caCertificate] };
}
