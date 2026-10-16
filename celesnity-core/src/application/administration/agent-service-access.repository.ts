import type { AuthenticatedContext } from './authenticated-context';

export interface AgentWorkloadIdentity {
  readonly subject: string;
  readonly email: string;
  readonly authenticationTime: number;
}

export interface AgentServiceAccessRepository {
  resolveDelegatedRoomPrincipal(
    roomId: string,
    callerSubject: string,
    workload: AgentWorkloadIdentity,
  ): Promise<AuthenticatedContext | null>;
  resolveRoomPrincipal(
    roomId: string,
    workload: AgentWorkloadIdentity,
    callerSubject?: string,
  ): Promise<AuthenticatedContext | null>;
}

export const AGENT_SERVICE_ACCESS_REPOSITORY = Symbol('AGENT_SERVICE_ACCESS_REPOSITORY');
