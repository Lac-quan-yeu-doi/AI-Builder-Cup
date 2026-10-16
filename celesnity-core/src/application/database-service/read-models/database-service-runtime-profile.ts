import type { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';

/**
 * Short-lived, non-persisted runtime material for a verified database service.
 * The credential is deliberately kept as the redacting value object rather than
 * a plain string so JSON/logging cannot accidentally expose it.
 */
export interface DatabaseServiceRuntimeProfile {
  readonly id: string;
  readonly connectorType: string;
  readonly config: NormalizedConnectionConfig;
  readonly credential: PlaintextCredentialPayload;
  readonly destinationHost: string;
  readonly destinationPort: number;
  readonly resolvedAddresses: readonly string[];
}

export class DatabaseServiceRuntimeProfileValue implements DatabaseServiceRuntimeProfile {
  public constructor(
    public readonly id: string,
    public readonly connectorType: string,
    public readonly config: NormalizedConnectionConfig,
    public readonly credential: PlaintextCredentialPayload,
    public readonly destinationHost: string,
    public readonly destinationPort: number,
    public readonly resolvedAddresses: readonly string[],
  ) {}

  public toJSON(): Readonly<Record<string, unknown>> {
    return {
      id: this.id,
      connectorType: this.connectorType,
      config: this.config.toRecord(),
      credential: '[REDACTED]',
      destinationHost: this.destinationHost,
      destinationPort: this.destinationPort,
      resolvedAddresses: this.resolvedAddresses,
    };
  }
}
