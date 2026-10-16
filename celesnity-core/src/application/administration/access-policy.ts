import type { AuthenticatedContext } from './authenticated-context';
import { roleAllows, type Permission } from './authorization-policy';
import type { WorkspaceFeature } from './workspace-feature';

/** Server-owned requirements. Never construct these from client claims. */
export interface AccessRequirement {
  readonly permission: Permission;
  readonly anyFeature?: readonly WorkspaceFeature[];
  /** Resource ownership is an independent prerequisite, including for admins. */
  readonly resourceOrganizationId?: string;
}

export type AccessDenial =
  'ORGANIZATION_ACCESS_DENIED' | 'MFA_REQUIRED' | 'PERMISSION_DENIED' | 'FEATURE_ACCESS_DENIED';
export type AccessDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: AccessDenial };

/** Common HTTP and delegated-tool policy. Resource/catalog ACLs further restrict it. */
export function decideAccess(
  principal: AuthenticatedContext,
  requirement: AccessRequirement,
): AccessDecision {
  if (
    principal.organizationStatus !== 'ACTIVE' ||
    (requirement.resourceOrganizationId !== undefined &&
      requirement.resourceOrganizationId !== principal.organizationId)
  ) {
    return { allowed: false, reason: 'ORGANIZATION_ACCESS_DENIED' };
  }
  if (principal.mfaRequired !== false && !principal.mfaVerified)
    return { allowed: false, reason: 'MFA_REQUIRED' };
  if (
    !roleAllows(principal.role, requirement.permission) ||
    (principal.servicePermissions !== undefined &&
      !principal.servicePermissions.includes(requirement.permission))
  )
    return { allowed: false, reason: 'PERMISSION_DENIED' };
  if (
    requirement.anyFeature !== undefined &&
    requirement.anyFeature.length > 0 &&
    principal.visibleFeatures !== null &&
    !requirement.anyFeature.some((feature) => principal.visibleFeatures?.includes(feature))
  ) {
    return { allowed: false, reason: 'FEATURE_ACCESS_DENIED' };
  }
  return { allowed: true };
}

export function requireAccess(
  principal: AuthenticatedContext,
  requirement: AccessRequirement,
): void {
  const decision = decideAccess(principal, requirement);
  if (!decision.allowed) throw new Error(`${decision.reason}: access to this operation is denied.`);
}
