import type { AuthenticatedContextStore, OrganizationRole } from './authenticated-context';
import type {
  CatalogAuthorizationDecision,
  CatalogPermission,
  CatalogResourceRef,
  CreateCatalogGrantInput,
} from './catalog-authorization';
import type { AdministrationRepository } from './administration.repository';
import type { CatalogAccessAuthorizer } from '@application/catalog-exploration/catalog-access-authorizer';
import type { IdentityAdministrationService } from './identity-administration.service';
import { bypassesForDemoNamespace } from '@application/administration/demo-namespace-access';
import { decideAccess } from './access-policy';
import type { WorkspaceFeature } from '@application/administration/workspace-feature';
import type { AuditWriter } from './audit-writer';
import { recordAuthorizationDecision } from './authorization-decision';

export class ServiceIdentityAdminDeniedError extends Error {
  public constructor() {
    super('SERVICE_IDENTITY_ADMIN_DENIED');
  }
}

export class AdministrationUseCases implements CatalogAccessAuthorizer {
  public constructor(
    private readonly repository: AdministrationRepository,
    private readonly contexts: AuthenticatedContextStore,
    private readonly identities: IdentityAdministrationService,
    private readonly audit?: AuditWriter,
  ) {}
  public me(): Promise<unknown> {
    const p = this.contexts.require();
    return this.repository.me(
      p.identityId,
      p.identityTenantId,
      p.organizationId,
      p.email,
      p.mfaVerified,
      p.visibleFeatures,
    );
  }
  public currentOrganization(): Promise<unknown> {
    return this.repository.currentOrganization(this.contexts.require().organizationId);
  }
  public async enableMfa(): Promise<unknown> {
    const principal = this.contexts.require();
    await this.identities.enableMfa(principal.identityTenantId);
    return this.repository.enableMfa(principal.organizationId, principal.identityTenantId);
  }
  public mfaPolicy(identityTenantId: string): Promise<{ mfaRequired: boolean }> {
    return this.repository.mfaPolicy(identityTenantId);
  }
  public loginContext(
    organizationSlug: string,
  ): Promise<{ identityTenantId: string; mfaRequired: boolean }> {
    return this.repository.loginContext(organizationSlug);
  }
  public listMemberships(): Promise<unknown> {
    return this.repository.listMemberships(this.contexts.require().organizationId);
  }
  private serviceIdentityAdministrator(): ReturnType<AuthenticatedContextStore['require']> {
    const principal = this.contexts.require();
    if (
      (principal.role !== 'ORG_OWNER' && principal.role !== 'ORG_ADMIN') ||
      (principal.mfaRequired && !principal.mfaVerified)
    ) {
      throw new ServiceIdentityAdminDeniedError();
    }
    return principal;
  }
  public listServiceIdentities(): Promise<unknown> {
    const principal = this.serviceIdentityAdministrator();
    return this.repository.listServiceIdentities(principal.organizationId);
  }
  public updateAgentServiceIdentity(input: {
    enabled: boolean;
    permissions: readonly ('workspace:read' | 'workspace:write')[];
    features: readonly WorkspaceFeature[];
  }): Promise<unknown> {
    const principal = this.serviceIdentityAdministrator();
    return this.repository.updateAgentServiceIdentity(
      principal.organizationId,
      principal.identityId,
      principal.requestId,
      input.enabled,
      input.permissions,
      input.features,
    );
  }
  public async invite(
    email: string,
    role: OrganizationRole,
    _expiresInHours: number,
  ): Promise<unknown> {
    const principal = this.contexts.require();
    const provisioned = await this.identities.provisionUser(principal.identityTenantId, email);
    try {
      const membership = await this.repository.invite(
        principal.organizationId,
        principal.identityTenantId,
        provisioned.subject,
        provisioned.email,
        role,
      );
      return { membership, setupLink: provisioned.setupLink };
    } catch (error) {
      if (provisioned.created)
        await this.identities
          .deleteUser(principal.identityTenantId, provisioned.subject)
          .catch(() => {});
      throw error;
    }
  }
  public updateMembership(
    id: string,
    role: OrganizationRole,
    status: 'ACTIVE' | 'REVOKED',
  ): Promise<unknown> {
    return this.repository.updateMembership(
      this.contexts.require().organizationId,
      id,
      role,
      status,
    );
  }
  public async removeAccount(id: string): Promise<void> {
    const principal = this.contexts.require();
    const target = await this.repository.prepareAccountRemoval(principal.organizationId, id);
    await this.identities.deleteUser(target.identityTenantId, target.subject);
    await this.repository.completeAccountRemoval(principal.organizationId, id, target.identityId);
  }
  public listAuditEvents(limit: number): Promise<unknown> {
    return this.repository.listAuditEvents(this.contexts.require().organizationId, limit);
  }
  public listGroups(): Promise<unknown> {
    return this.repository.listGroups(this.contexts.require().organizationId);
  }
  public createGroup(name: string, description?: string): Promise<unknown> {
    return this.repository.createGroup(this.contexts.require().organizationId, name, description);
  }
  public addGroupMember(groupId: string, identityId: string): Promise<unknown> {
    return this.repository.addGroupMember(
      this.contexts.require().organizationId,
      groupId,
      identityId,
    );
  }
  public removeGroupMember(groupId: string, identityId: string): Promise<void> {
    return this.repository.removeGroupMember(
      this.contexts.require().organizationId,
      groupId,
      identityId,
    );
  }
  public updateGroupFeatures(
    groupId: string,
    visibleFeatures: readonly WorkspaceFeature[],
  ): Promise<unknown> {
    return this.repository.updateGroupFeatures(
      this.contexts.require().organizationId,
      groupId,
      visibleFeatures,
    );
  }
  public listCatalogGrants(): Promise<unknown> {
    return this.repository.listCatalogGrants(this.contexts.require().organizationId);
  }
  public createCatalogGrant(input: CreateCatalogGrantInput): Promise<unknown> {
    const principal = this.contexts.require();
    return this.repository.createCatalogGrant(
      principal.organizationId,
      principal.identityId,
      input,
    );
  }
  public deleteCatalogGrant(grantId: string): Promise<void> {
    return this.repository.deleteCatalogGrant(this.contexts.require().organizationId, grantId);
  }
  public async authorizeCatalog(
    permission: CatalogPermission,
    hierarchy: readonly CatalogResourceRef[],
  ): Promise<CatalogAuthorizationDecision> {
    const principal = this.contexts.require();
    const finish = async (
      decision: CatalogAuthorizationDecision,
    ): Promise<CatalogAuthorizationDecision> => {
      if (principal.agentRunId === undefined) return decision;
      if (this.audit === undefined || principal.requestId === undefined)
        throw new Error('Delegated catalog authorization requires an auditable request.');
      const resource = hierarchy.at(-1);
      await recordAuthorizationDecision(this.audit, {
        organizationId: principal.organizationId,
        actorIdentityId: principal.identityId,
        serviceIdentityId: principal.agentServiceIdentityId,
        sessionId: principal.sessionId,
        requestId: principal.requestId,
        action: `catalog:${permission}`,
        resourceType: resource?.type ?? 'CATALOG',
        resourceId: resource?.id,
        runId: principal.agentRunId,
        agentName: principal.agentName,
        databaseScope:
          principal.agentRunScope === null
            ? null
            : principal.agentRunScope === undefined
              ? undefined
              : `${principal.agentRunScope.catalog ?? ''}.${principal.agentRunScope.schema}`,
        allowed: decision.allowed,
        reason: decision.reason,
      });
      return decision;
    };
    const access = decideAccess(principal, {
      permission: ['DISCOVER', 'DESCRIBE', 'PREVIEW', 'SELECT'].includes(permission)
        ? 'workspace:read'
        : 'workspace:write',
    });
    if (!access.allowed)
      return finish({ allowed: false, matchedGrantIds: [], reason: 'DEFAULT_DENY' });
    if (
      principal.agentRunId !== undefined &&
      (principal.agentRunScope === undefined ||
        !withinAgentRunScope(principal.agentRunScope, permission, hierarchy))
    )
      return finish({ allowed: false, matchedGrantIds: [], reason: 'RUN_SCOPE_DENIED' });
    // The demo exception bypasses only the human catalog ACL. An agent always
    // needs its own explicit catalog grant, including for demo namespaces.
    const userBypass =
      bypassesForDemoNamespace(permission, hierarchy) || principal.automationRunId !== undefined;
    if (principal.automationRunId !== undefined && principal.agentName === undefined)
      return finish({ allowed: false, matchedGrantIds: [], reason: 'DEFAULT_DENY' });
    if (userBypass && principal.agentName === undefined) {
      return finish({ allowed: true, matchedGrantIds: [], reason: 'EXPLICIT_ALLOW' });
    }
    return finish(
      await this.repository.authorizeCatalog(
        principal.organizationId,
        principal.identityId,
        permission,
        hierarchy,
        principal.agentName,
        userBypass,
      ),
    );
  }
}

/** A selected database limits every data operation, including discovery parents. */
function withinAgentRunScope(
  scope: { readonly catalog?: string; readonly schema: string } | null,
  permission: CatalogPermission,
  hierarchy: readonly CatalogResourceRef[],
): boolean {
  if (scope === null) return true;
  const catalog = hierarchy.find((resource) => resource.type === 'CATALOG')?.id;
  if (
    catalog === undefined ||
    (scope.catalog !== undefined && catalog.toLowerCase() !== scope.catalog.toLowerCase())
  )
    return false;
  const namespace = hierarchy.find(
    (resource) => resource.type === 'SCHEMA' || resource.type === 'DATABASE',
  );
  if (namespace === undefined) return permission === 'DISCOVER' && hierarchy.length === 1;
  return namespace.id.toLowerCase() === `${catalog}.${scope.schema}`.toLowerCase();
}
