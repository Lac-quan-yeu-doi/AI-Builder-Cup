import type { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import type { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type { NetworkDestination } from '@application/database-service/interfaces/i-connection-probe';

export interface NormalizedConnectionDetails {
  readonly config: NormalizedConnectionConfig;
  readonly destination: NetworkDestination;
  readonly credential?: PlaintextCredentialPayload;
}

export interface IConnectionConfigCodec {
  normalize(input: unknown, existing?: NormalizedConnectionConfig): NormalizedConnectionDetails;
  restore(config: NormalizedConnectionConfig): Omit<NormalizedConnectionDetails, 'credential'>;
}
