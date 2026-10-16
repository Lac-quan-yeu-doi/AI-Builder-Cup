import type { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type { CdcConnectionSetupMode } from '@domain/database-service/value-objects/cdc-connection-profile';
import type { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';

export interface CdcConnectionRuntimeProfile {
  readonly id: string;
  readonly connectorType: string;
  readonly config: NormalizedConnectionConfig;
  readonly credential: PlaintextCredentialPayload;
  readonly destinationHost: string;
  readonly destinationPort: number;
  readonly resolvedAddresses: readonly string[];
  readonly setupMode: CdcConnectionSetupMode;
  readonly publicationName?: string;
  readonly slotName?: string;
}

export class CdcConnectionRuntimeProfileValue implements CdcConnectionRuntimeProfile {
  public constructor(
    public readonly id: string,
    public readonly connectorType: string,
    public readonly config: NormalizedConnectionConfig,
    public readonly credential: PlaintextCredentialPayload,
    public readonly destinationHost: string,
    public readonly destinationPort: number,
    public readonly resolvedAddresses: readonly string[],
    public readonly setupMode: CdcConnectionSetupMode,
    public readonly publicationName?: string,
    public readonly slotName?: string,
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
      setupMode: this.setupMode,
      publicationName: this.publicationName,
      slotName: this.slotName,
    };
  }
}
