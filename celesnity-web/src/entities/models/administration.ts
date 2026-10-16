import type { WorkspaceFeature } from './workspace-feature';

export interface TenantOrganizationSummary {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly homeRegion: string;
  readonly mfaRequired: boolean;
  readonly role: string;
}
export interface AdministrationSession {
  readonly identityId: string;
  readonly email?: string;
  readonly identityTenantId: string;
  readonly mfaVerified: boolean;
  readonly organization: TenantOrganizationSummary;
  readonly visibleFeatures: readonly WorkspaceFeature[] | null;
}

export interface ServiceIdentitySummary {
  /** Older Core versions omit this ID; those identities cannot be selected for grants. */
  readonly identityId?: string;
  readonly purpose: 'BACKGROUND' | 'AGENT';
  readonly enabled: boolean;
  readonly permissions: readonly ('workspace:read' | 'workspace:write')[];
  readonly features: readonly WorkspaceFeature[];
  readonly updatedAt: string;
  readonly identity: { readonly status: string };
}

export interface UpdateAgentServiceIdentityInput {
  readonly enabled: boolean;
  readonly permissions: readonly ('workspace:read' | 'workspace:write')[];
  readonly features: readonly WorkspaceFeature[];
}

export const organizationRoles = [
  'ORG_OWNER',
  'ORG_ADMIN',
  'DATA_ENGINEER',
  'ANALYST',
  'VIEWER',
  'AUDITOR',
] as const;
export type OrganizationRole = (typeof organizationRoles)[number];
export type MembershipStatus = 'ACTIVE' | 'REVOKED';

export interface OrganizationMember {
  readonly id: string;
  readonly identityId: string;
  readonly role: OrganizationRole | 'SERVICE_ACCOUNT';
  readonly status: MembershipStatus;
  readonly createdAt: string;
  readonly identity: {
    readonly id: string;
    readonly email?: string;
    readonly displayName?: string;
    readonly status: string;
  };
}

export interface MemberInvitation {
  readonly membership: OrganizationMember;
  readonly setupLink?: string;
}

export interface AuthorizationGroupMember {
  readonly identityId: string;
  readonly identity: {
    readonly id: string;
    readonly email?: string;
    readonly displayName?: string;
  };
}

export interface AuthorizationGroup {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly members: readonly AuthorizationGroupMember[];
  readonly featureVisibilityConfigured: boolean;
  readonly visibleFeatures: readonly WorkspaceFeature[];
}

export const catalogResourceTypes = ['CATALOG', 'DATABASE', 'SCHEMA', 'TABLE', 'COLUMN'] as const;
export type CatalogResourceType = (typeof catalogResourceTypes)[number];
export const catalogPermissions = [
  'DISCOVER',
  'DESCRIBE',
  'PREVIEW',
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'EXECUTE',
  'ALTER',
  'GRANT',
  'OWN',
] as const;
export type CatalogPermission = (typeof catalogPermissions)[number];
export type PolicyEffect = 'ALLOW' | 'DENY';

export interface CatalogAccessGrant {
  readonly id: string;
  readonly groupId?: string;
  readonly identityId?: string;
  readonly agentName?: string;
  readonly group?: { readonly id: string; readonly name: string };
  readonly identity?: {
    readonly id: string;
    readonly email?: string;
    readonly displayName?: string;
  };
  readonly resourceType: CatalogResourceType;
  readonly resourceId: string;
  readonly permissions: readonly CatalogPermission[];
  readonly effect: PolicyEffect;
  readonly includeDescendants: boolean;
  readonly grantOption: boolean;
  readonly validFrom?: string;
  readonly expiresAt?: string;
  readonly createdAt: string;
}

export interface AdministrationGovernance {
  readonly serviceIdentities: readonly ServiceIdentitySummary[];
  readonly session: AdministrationSession;
  readonly members: readonly OrganizationMember[];
  readonly groups: readonly AuthorizationGroup[];
  readonly grants: readonly CatalogAccessGrant[];
}

export interface InviteMemberInput {
  readonly email: string;
  readonly role: OrganizationRole;
  readonly expiresInHours: number;
}

export interface UpdateMemberInput {
  readonly membershipId: string;
  readonly role: OrganizationRole;
  readonly status: MembershipStatus;
}

export interface CreateGroupInput {
  readonly name: string;
  readonly description?: string;
}

export interface ChangeGroupMemberInput {
  readonly groupId: string;
  readonly identityId: string;
}

export interface UpdateGroupFeaturesInput {
  readonly groupId: string;
  readonly visibleFeatures: readonly WorkspaceFeature[];
}

export interface CreateCatalogGrantInput {
  readonly principalType: 'GROUP' | 'MEMBER' | 'AGENT' | 'SERVICE_IDENTITY';
  readonly principalId: string;
  readonly resourceType: CatalogResourceType;
  readonly resourceId: string;
  readonly permissions: readonly CatalogPermission[];
  readonly effect: PolicyEffect;
  readonly includeDescendants: boolean;
  readonly grantOption: boolean;
}
