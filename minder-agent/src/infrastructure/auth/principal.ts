import { createPrincipalScope } from "@domain/index.js";
import type {
  AuthenticatedPrincipal,
  OrganizationRole,
  WorkspaceFeature,
} from "@application/shared/ports/auth/authentication.js";
export type {
  AuthenticatedPrincipal,
  OrganizationRole,
  WorkspaceFeature,
} from "@application/shared/ports/auth/authentication.js";

export function createAuthenticatedPrincipal(input: {
  readonly subject: string;
  readonly identityTenantId: string;
  readonly organizationId: string;
  readonly identityId: string;
  readonly membershipId: string;
  readonly role: OrganizationRole;
  readonly permissions?: readonly string[];
  readonly visibleFeatures: readonly WorkspaceFeature[] | null;
  readonly mfaVerified: boolean;
  readonly authenticationTime: number;
}): AuthenticatedPrincipal {
  return Object.freeze({
    subject: input.subject,
    scope: createPrincipalScope({
      identityTenantId: input.identityTenantId,
      organizationId: input.organizationId,
      identityId: input.identityId,
    }),
    membershipId: input.membershipId,
    role: input.role,
    permissions: Object.freeze([...(input.permissions ?? [])]),
    visibleFeatures:
      input.visibleFeatures === null
        ? null
        : Object.freeze([...input.visibleFeatures]),
    mfaVerified: input.mfaVerified,
    authenticationTime: input.authenticationTime,
    authenticationMethod: "core_assertion" as const,
  });
}
