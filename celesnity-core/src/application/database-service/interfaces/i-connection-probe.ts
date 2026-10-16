import type { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type { VerificationOutcomeValue } from '@domain/database-service/value-objects/connection-value-objects';
import type { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';

export interface NetworkDestination {
  readonly host: string;
  readonly port: number;
  readonly engineLabel: string;
}

export interface ConnectionProbeInput {
  readonly config: NormalizedConnectionConfig;
  readonly resolvedAddresses: readonly string[];
  readonly credential: PlaintextCredentialPayload;
}

export interface ConnectionTestResult {
  readonly status: VerificationOutcomeValue;
  readonly testedAt: Date;
  readonly failureReason?: string;
}

export interface IConnectionProbe {
  test(input: ConnectionProbeInput): Promise<ConnectionTestResult>;
}
