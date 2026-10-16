/**
 * The complete durable ownership boundary for a human principal. This value is
 * deliberately independent from transport and cryptography: only a verified
 * authentication adapter may construct it from external claims.
 */
export interface PrincipalScope {
  readonly identityTenantId: string;
  readonly organizationId: string;
  readonly identityId: string;
}

export interface OrganizationScope {
  readonly identityTenantId: string;
  readonly organizationId: string;
}

export function createPrincipalScope(input: PrincipalScope): PrincipalScope {
  const scope = {
    identityTenantId: boundedComponent(
      "identityTenantId",
      input.identityTenantId,
    ),
    organizationId: boundedComponent("organizationId", input.organizationId),
    identityId: boundedComponent("identityId", input.identityId),
  };
  return Object.freeze(scope);
}

/**
 * A delimiter-safe, stable key for in-memory maps. PostgreSQL stores the three
 * typed components in separate columns, never this opaque encoding.
 */
export function principalScopeKey(scope: PrincipalScope): string {
  return [scope.identityTenantId, scope.organizationId, scope.identityId]
    .map((value) => Buffer.from(value, "utf8").toString("base64url"))
    .join(".");
}

/**
 * A stable manifest workspace key shared by every identity in an organization.
 * The identity tenant remains part of the boundary because organization IDs
 * are only unique within their identity tenant.
 */
export function organizationScopeKey(scope: OrganizationScope): string {
  return [
    boundedComponent("identityTenantId", scope.identityTenantId),
    boundedComponent("organizationId", scope.organizationId),
  ]
    .map((value) => Buffer.from(value, "utf8").toString("base64url"))
    .join(".");
}

function boundedComponent(name: string, value: string): string {
  const bytes = Buffer.byteLength(value, "utf8");
  if (value.trim() === "" || bytes < 1 || bytes > 128) {
    throw new Error(`${name} must contain between 1 and 128 UTF-8 bytes.`);
  }
  return value;
}
