import type { AuditWriter } from './audit-writer';

/** The stable, data-free Core decision record shared by delegated policies. */
export interface AuthorizationDecisionV1 {
  readonly organizationId: string;
  readonly actorIdentityId?: string;
  readonly serviceIdentityId?: string;
  readonly sessionId?: string;
  readonly requestId: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId?: string;
  readonly roomId?: string;
  readonly runId?: string;
  readonly agentName?: string;
  readonly workloadEmail?: string;
  /** null means All databases, still constrained by user and Agent grants. */
  readonly databaseScope?: string | null;
  readonly allowed: boolean;
  readonly reason: string;
}

/** Persistence failure must reject the protected operation, including an allow. */
export function recordAuthorizationDecision(
  audit: AuditWriter,
  decision: AuthorizationDecisionV1,
): Promise<void> {
  return audit.write({
    organizationId: decision.organizationId,
    actorIdentityId: decision.actorIdentityId,
    sessionId: decision.sessionId,
    requestId: decision.requestId,
    eventType: 'AUTHORIZATION_DECISION',
    action: decision.action.slice(0, 160),
    resourceType: decision.resourceType.slice(0, 120),
    resourceId: decision.resourceId?.slice(0, 255),
    outcome: decision.allowed ? 'SUCCEEDED' : 'FAILED',
    metadata: {
      contractVersion: 1,
      allowed: decision.allowed,
      reason: decision.reason,
      roomId: decision.roomId ?? null,
      runId: decision.runId ?? null,
      agentName: decision.agentName ?? null,
      serviceIdentityId: decision.serviceIdentityId ?? null,
      workloadEmail: decision.workloadEmail ?? null,
      databaseScope: decision.databaseScope ?? null,
    },
  });
}
