import type { NetworkDestination } from '@application/database-service/interfaces/i-connection-probe';

export interface ResolvedDestination extends NetworkDestination {
  readonly addresses: readonly string[];
}

export interface IDestinationPolicy {
  resolveAllowed(destination: NetworkDestination): Promise<ResolvedDestination>;
}
