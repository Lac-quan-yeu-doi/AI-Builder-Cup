import type { IChartCollectionRepository } from '@application/chart-collection/interfaces/i-chart-collection.repository';
import type { AuditWriter } from '@application/administration/audit-writer';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { recordAuthorizationDecision } from '@application/administration/authorization-decision';
import { ChartCollectionError } from '@domain/chart-collection/errors/chart-collection.errors';
import type {
  CollectionAccess,
  CollectionPrincipal,
} from '@domain/chart-collection/models/chart-collection';

const ACCESS_RANK: Readonly<Record<CollectionAccess, number>> = {
  NO_ACCESS: 0,
  VIEW: 1,
  CURATE: 2,
};
const ADMIN_ROLES = new Set(['PLATFORM_ADMIN', 'ORG_OWNER', 'ORG_ADMIN']);

export class CollectionAuthorizationService {
  public constructor(
    private readonly collections: IChartCollectionRepository,
    private readonly audit: AuditWriter,
    private readonly contexts: AuthenticatedContextStore,
  ) {}

  /** Bind collection operations to the verified Core actor before any repository read or write. */
  public async requireActor(
    principal: CollectionPrincipal,
    action: 'LIST' | 'ENSURE_PERSONAL' | 'CREATE' | 'MOVE' | 'RENAME' | 'ARCHIVE' | 'SET_GRANT',
    resourceId?: string,
  ): Promise<void> {
    const context = this.contexts.require();
    const requestId = context.requestId;
    if (requestId === undefined) throw new Error('Collection authorization requires a request ID.');
    const allowed =
      context.organizationId === principal.organizationId &&
      context.identityId === principal.identityId &&
      (!principal.isOrganizationAdmin || ADMIN_ROLES.has(context.role));
    await recordAuthorizationDecision(this.audit, {
      organizationId: context.organizationId,
      actorIdentityId: context.identityId,
      serviceIdentityId: context.agentServiceIdentityId,
      sessionId: context.sessionId,
      requestId,
      action: `collection:${action}`,
      resourceType: 'chart-collection',
      resourceId,
      runId: context.agentRunId ?? context.automationRunId,
      agentName: context.agentName,
      allowed,
      reason: allowed ? 'ACTOR_VERIFIED' : 'ACTOR_MISMATCH',
    });
    if (!allowed) throw ChartCollectionError.accessDenied();
  }

  public async requireAccess(
    collectionId: string,
    principal: CollectionPrincipal,
    requested: Exclude<CollectionAccess, 'NO_ACCESS'>,
  ): Promise<CollectionAccess> {
    const context = this.contexts.require();
    const requestId = context.requestId;
    if (requestId === undefined) throw new Error('Collection authorization requires a request ID.');
    const record = (allowed: boolean, reason: string): Promise<void> =>
      recordAuthorizationDecision(this.audit, {
        organizationId: context.organizationId,
        actorIdentityId: context.identityId,
        serviceIdentityId: context.agentServiceIdentityId,
        sessionId: context.sessionId,
        requestId,
        action: `collection:${requested}`,
        resourceType: 'chart-collection',
        resourceId: collectionId,
        roomId: undefined,
        runId: context.agentRunId ?? context.automationRunId,
        agentName: context.agentName,
        allowed,
        reason,
      });
    if (
      context.organizationId !== principal.organizationId ||
      context.identityId !== principal.identityId ||
      (principal.isOrganizationAdmin && !ADMIN_ROLES.has(context.role))
    ) {
      await record(false, 'ACTOR_MISMATCH');
      throw ChartCollectionError.accessDenied();
    }
    const collection = await this.collections.findById(principal.organizationId, collectionId);
    if (collection === null) {
      await record(false, 'COLLECTION_NOT_FOUND');
      throw ChartCollectionError.notFound();
    }
    if (collection.organizationId !== principal.organizationId) {
      await record(false, 'ORGANIZATION_ACCESS_DENIED');
      throw ChartCollectionError.accessDenied();
    }

    const effective =
      this.resolveFixedAccess(collection.ownerIdentityId, collection.type, principal) ??
      (await this.collections.effectiveAccess(collectionId, principal));
    if (ACCESS_RANK[effective] < ACCESS_RANK[requested]) {
      await record(false, 'COLLECTION_ACCESS_DENIED');
      throw ChartCollectionError.accessDenied();
    }
    await record(true, 'COLLECTION_ACCESS_GRANTED');
    return effective;
  }

  public async requireTopLevelCreate(principal: CollectionPrincipal): Promise<void> {
    const context = this.contexts.require();
    const requestId = context.requestId;
    if (requestId === undefined) throw new Error('Collection authorization requires a request ID.');
    const actorMatches =
      context.organizationId === principal.organizationId &&
      context.identityId === principal.identityId;
    const allowed = actorMatches && principal.isOrganizationAdmin && ADMIN_ROLES.has(context.role);
    await recordAuthorizationDecision(this.audit, {
      organizationId: context.organizationId,
      actorIdentityId: context.identityId,
      serviceIdentityId: context.agentServiceIdentityId,
      sessionId: context.sessionId,
      requestId,
      action: 'collection:CREATE_ROOT',
      resourceType: 'chart-collection',
      runId: context.agentRunId ?? context.automationRunId,
      agentName: context.agentName,
      allowed,
      reason: !actorMatches
        ? 'ACTOR_MISMATCH'
        : allowed
          ? 'COLLECTION_ACCESS_GRANTED'
          : 'COLLECTION_ACCESS_DENIED',
    });
    if (!allowed) throw ChartCollectionError.accessDenied();
  }

  private resolveFixedAccess(
    ownerIdentityId: string | null,
    type: 'ROOT' | 'PERSONAL' | 'COLLECTION',
    principal: CollectionPrincipal,
  ): CollectionAccess | undefined {
    // A personal collection is an owner boundary, not an organization-admin
    // collection. Resolve it before the admin shortcut so another user's
    // private charts and dashboards are never enumerated as admin content.
    if (type === 'PERSONAL') {
      return ownerIdentityId === principal.identityId ? 'CURATE' : 'NO_ACCESS';
    }
    if (principal.isOrganizationAdmin) return 'CURATE';
    return undefined;
  }
}
