import type { OrganizationRole } from './authenticated-context';
import type {
  CatalogAuthorizationDecision,
  CatalogPermission,
  CatalogResourceRef,
  CreateCatalogGrantInput,
} from './catalog-authorization';
import type { WorkspaceFeature } from './workspace-feature';
export const ADMINISTRATION_REPOSITORY = Symbol('ADMINISTRATION_REPOSITORY');

export interface AccountRemovalTarget {
  readonly identityId: string;
  readonly identityTenantId: string;
  readonly subject: string;
}

export interface AdministrationRepository {
  me(
    identityId: string,
    identityTenantId: string,
    organizationId: string,
    email: string | undefined,
    mfaVerified: boolean,
    visibleFeatures: readonly WorkspaceFeature[] | null | undefined,
  ): Promise<unknown>;
  currentOrganization(organizationId: string): Promise<unknown>;
  enableMfa(organizationId: string, identityTenantId: string): Promise<unknown>;
  mfaPolicy(identityTenantId: string): Promise<{ mfaRequired: boolean }>;
  loginContext(
    organizationSlug: string,
  ): Promise<{ identityTenantId: string; mfaRequired: boolean }>;
  listMemberships(organizationId: string): Promise<unknown>;
  invite(
    organizationId: string,
    identityTenantId: string,
    subject: string,
    email: string,
    role: OrganizationRole,
  ): Promise<unknown>;
  updateMembership(
    organizationId: string,
    id: string,
    role: OrganizationRole,
    status: 'ACTIVE' | 'REVOKED',
  ): Promise<unknown>;
  prepareAccountRemoval(organizationId: string, id: string): Promise<AccountRemovalTarget>;
  completeAccountRemoval(organizationId: string, id: string, identityId: string): Promise<void>;
  listAuditEvents(organizationId: string, limit: number): Promise<unknown>;
  listGroups(organizationId: string): Promise<unknown>;
  createGroup(organizationId: string, name: string, description?: string): Promise<unknown>;
  addGroupMember(organizationId: string, groupId: string, identityId: string): Promise<unknown>;
  removeGroupMember(organizationId: string, groupId: string, identityId: string): Promise<void>;
  updateGroupFeatures(
    organizationId: string,
    groupId: string,
    visibleFeatures: readonly WorkspaceFeature[],
  ): Promise<unknown>;
  listCatalogGrants(organizationId: string): Promise<unknown>;
  listServiceIdentities(organizationId: string): Promise<unknown>;
  updateAgentServiceIdentity(
    organizationId: string,
    actorIdentityId: string,
    requestId: string | undefined,
    enabled: boolean,
    permissions: readonly ('workspace:read' | 'workspace:write')[],
    features: readonly WorkspaceFeature[],
  ): Promise<unknown>;
  createCatalogGrant(
    organizationId: string,
    actorIdentityId: string,
    input: CreateCatalogGrantInput,
  ): Promise<unknown>;
  deleteCatalogGrant(organizationId: string, grantId: string): Promise<void>;
  authorizeCatalog(
    organizationId: string,
    identityId: string,
    permission: CatalogPermission,
    hierarchy: readonly CatalogResourceRef[],
    agentName?: string,
    userBypass?: boolean,
  ): Promise<CatalogAuthorizationDecision>;
}
