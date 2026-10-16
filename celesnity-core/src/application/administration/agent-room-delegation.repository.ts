import type { AuthenticatedContext } from './authenticated-context';

export const AGENT_ROOM_DELEGATION_REPOSITORY = Symbol('AGENT_ROOM_DELEGATION_REPOSITORY');

/** Resolves a room-bound human principal without trusting tenant IDs from Minder. */
export interface AgentRoomDelegationRepository {
  resolve(roomId: string, callerSubject: string): Promise<AuthenticatedContext | undefined>;
  registerRun(input: {
    readonly roomId: string;
    readonly runId: string;
    readonly agentName: string;
    readonly scope: { readonly catalog?: string; readonly schema: string } | null;
    readonly principal: AuthenticatedContext;
  }): Promise<void>;
  resolveRun(
    runId: string,
    roomId: string,
    principal: AuthenticatedContext,
  ): Promise<{ readonly catalog?: string; readonly schema: string } | null | undefined>;
  closeRun(roomId: string, runId: string, principal: AuthenticatedContext): Promise<void>;
  automationRunBelongsToOrganization(
    agentRunId: string,
    organizationId: string,
    agentName: string,
  ): Promise<boolean>;
}
