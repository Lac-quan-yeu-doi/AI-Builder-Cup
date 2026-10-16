import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from 'node:crypto';

import type {
  AuthenticatedContext,
  OrganizationRole,
} from '@application/administration/authenticated-context';
import {
  isWorkspaceFeature,
  type WorkspaceFeature,
} from '@application/administration/workspace-feature';

const ISSUER = 'celesnity-core';
import { decideAccess } from './access-policy';
import type { Permission } from './authorization-policy';

const ASSERTION_PERMISSIONS: readonly Permission[] = [
  'workspace:read',
  'workspace:write',
  'organization:read',
  'organization:manage',
  'audit:read',
  'support:access',
];
const AUDIENCE = 'minder-agent';
const MAX_TTL_SECONDS = 60;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ORGANIZATION_ROLES = new Set<OrganizationRole>([
  'PLATFORM_ADMIN',
  'SUPPORT',
  'ORG_OWNER',
  'ORG_ADMIN',
  'DATA_ENGINEER',
  'ANALYST',
  'VIEWER',
  'AUDITOR',
  'SERVICE_ACCOUNT',
]);

export interface MinderPrincipalAssertion {
  readonly iss: typeof ISSUER;
  readonly aud: typeof AUDIENCE;
  readonly sub: string;
  readonly tenant_id: string;
  readonly organization_id: string;
  readonly identity_id: string;
  readonly membership_id: string;
  readonly role: OrganizationRole;
  readonly permissions: readonly Permission[];
  readonly mfa_verified: boolean;
  readonly visible_features: readonly WorkspaceFeature[] | null;
  readonly auth_time: number;
  readonly iat: number;
  readonly nbf: number;
  readonly exp: number;
  readonly jti: string;
}

export interface MinderPrincipalAssertionIssuer {
  issue(context: AuthenticatedContext, nowSeconds: number): string;
  expiresAt(nowSeconds: number): number;
}

export const MINDER_PRINCIPAL_ASSERTION_ISSUER = Symbol('MinderPrincipalAssertionIssuer');

export class Ed25519MinderPrincipalAssertionIssuer implements MinderPrincipalAssertionIssuer {
  private readonly privateKey: ReturnType<typeof createPrivateKey>;

  public constructor(
    privateKeyPem: string,
    private readonly keyId: string,
    private readonly ttlSeconds: number,
  ) {
    if (keyId.trim() === '') throw new Error('Minder assertion key ID is required.');
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_TTL_SECONDS) {
      throw new Error(`Minder assertion TTL must be an integer from 1 through ${MAX_TTL_SECONDS}.`);
    }
    this.privateKey = createPrivateKey(privateKeyPem);
    if (this.privateKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('Minder assertion signing key must be Ed25519.');
    }
  }

  public issue(context: AuthenticatedContext, nowSeconds: number): string {
    assertNumericDate('nowSeconds', nowSeconds);
    const header = encodeJson({ alg: 'EdDSA', kid: this.keyId, typ: 'MINDER-ASSERTION', v: 1 });
    const payload = encodeJson(toAssertionClaims(context, nowSeconds, this.ttlSeconds));
    const signingInput = `${header}.${payload}`;
    const signature = sign(null, Buffer.from(signingInput, 'utf8'), this.privateKey).toString(
      'base64url',
    );
    return `${signingInput}.${signature}`;
  }

  public expiresAt(nowSeconds: number): number {
    assertNumericDate('nowSeconds', nowSeconds);
    return nowSeconds + this.ttlSeconds;
  }
}

export function verifyCompactAssertion(
  token: string,
  publicKeyPem: string,
  nowSeconds: number,
): MinderPrincipalAssertion {
  assertNumericDate('nowSeconds', nowSeconds);
  const [headerSegment, payloadSegment, signatureSegment, extraSegment] = token.split('.');
  if (
    headerSegment === undefined ||
    payloadSegment === undefined ||
    signatureSegment === undefined ||
    extraSegment !== undefined ||
    !isBase64UrlSegment(headerSegment) ||
    !isBase64UrlSegment(payloadSegment) ||
    !isBase64UrlSegment(signatureSegment)
  ) {
    throw new Error('Minder assertion must have exactly three base64url segments.');
  }

  const header = decodeJsonObject(headerSegment, 'header');
  if (
    header.alg !== 'EdDSA' ||
    header.typ !== 'MINDER-ASSERTION' ||
    header.v !== 1 ||
    typeof header.kid !== 'string' ||
    header.kid.trim() === ''
  ) {
    throw new Error('Minder assertion header is invalid.');
  }

  const publicKey = createPublicKey(publicKeyPem);
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Minder assertion verification key must be Ed25519.');
  }
  const verified = verify(
    null,
    Buffer.from(`${headerSegment}.${payloadSegment}`, 'utf8'),
    publicKey,
    Buffer.from(signatureSegment, 'base64url'),
  );
  if (!verified) throw new Error('Minder assertion signature is invalid.');

  const claims = decodeAssertionClaims(decodeJsonObject(payloadSegment, 'payload'));
  if (claims.nbf > nowSeconds || claims.iat > nowSeconds || claims.exp <= nowSeconds) {
    throw new Error('Minder assertion is not currently valid.');
  }
  return claims;
}

function toAssertionClaims(
  context: AuthenticatedContext,
  issuedAt: number,
  ttlSeconds: number,
): MinderPrincipalAssertion {
  const claims: MinderPrincipalAssertion = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: requiredClaimValue('sub', context.subject),
    tenant_id: requiredClaimValue('tenant_id', context.identityTenantId),
    organization_id: requiredClaimValue('organization_id', context.organizationId),
    identity_id: requiredClaimValue('identity_id', context.identityId),
    membership_id: requiredClaimValue('membership_id', context.membershipId),
    role: context.role,
    permissions: ASSERTION_PERMISSIONS.filter(
      (permission) => decideAccess(context, { permission }).allowed,
    ),
    mfa_verified: context.mfaVerified,
    visible_features: context.visibleFeatures === undefined ? [] : context.visibleFeatures,
    auth_time: context.authenticationTime,
    iat: issuedAt,
    nbf: issuedAt,
    exp: issuedAt + ttlSeconds,
    jti: randomUUID(),
  };
  return decodeAssertionClaims(claims as unknown as Record<string, unknown>);
}

function decodeAssertionClaims(value: Record<string, unknown>): MinderPrincipalAssertion {
  if (value.iss !== ISSUER || value.aud !== AUDIENCE) {
    throw new Error('Minder assertion issuer or audience is invalid.');
  }
  const sub = requiredClaimValue('sub', value.sub);
  const tenantId = requiredClaimValue('tenant_id', value.tenant_id);
  const organizationId = requiredClaimValue('organization_id', value.organization_id);
  const identityId = requiredClaimValue('identity_id', value.identity_id);
  const membershipId = requiredClaimValue('membership_id', value.membership_id);
  if (typeof value.role !== 'string' || !ORGANIZATION_ROLES.has(value.role as OrganizationRole)) {
    throw new Error('Minder assertion role is invalid.');
  }
  if (typeof value.mfa_verified !== 'boolean') {
    throw new Error('Minder assertion mfa_verified is invalid.');
  }
  const visibleFeatures = decodeVisibleFeatures(value.visible_features);
  if (
    !Array.isArray(value.permissions) ||
    value.permissions.some(
      (permission) => !ASSERTION_PERMISSIONS.includes(permission as Permission),
    )
  ) {
    throw new Error('Minder assertion permissions are invalid.');
  }
  assertNumericDate('auth_time', value.auth_time);
  assertNumericDate('iat', value.iat);
  assertNumericDate('nbf', value.nbf);
  assertNumericDate('exp', value.exp);
  if (value.nbf < value.iat || value.exp <= value.iat || value.exp - value.iat > MAX_TTL_SECONDS) {
    throw new Error('Minder assertion time window is invalid.');
  }
  if (typeof value.jti !== 'string' || !UUID_V4.test(value.jti)) {
    throw new Error('Minder assertion jti is invalid.');
  }
  return Object.freeze({
    iss: ISSUER,
    aud: AUDIENCE,
    sub,
    tenant_id: tenantId,
    organization_id: organizationId,
    identity_id: identityId,
    membership_id: membershipId,
    role: value.role as OrganizationRole,
    permissions: Object.freeze([...(value.permissions as Permission[])]),
    mfa_verified: value.mfa_verified,
    visible_features: visibleFeatures,
    auth_time: value.auth_time,
    iat: value.iat,
    nbf: value.nbf,
    exp: value.exp,
    jti: value.jti,
  });
}

function decodeVisibleFeatures(value: unknown): readonly WorkspaceFeature[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) {
    throw new Error('Minder assertion visible_features is invalid.');
  }
  const features: WorkspaceFeature[] = [];
  for (const feature of value) {
    if (typeof feature !== 'string' || !isWorkspaceFeature(feature)) {
      throw new Error('Minder assertion visible_features is invalid.');
    }
    features.push(feature);
  }
  return Object.freeze(features);
}

function requiredClaimValue(name: string, value: unknown): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') === 0) {
    throw new Error(`Minder assertion ${name} is invalid.`);
  }
  return value;
}

function assertNumericDate(name: string, value: unknown): asserts value is number {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Minder assertion ${name} must be a non-negative integer.`);
  }
}

function encodeJson(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJsonObject(segment: string, name: string): Record<string, unknown> {
  try {
    const decoded = Buffer.from(segment, 'base64url').toString('utf8');
    if (Buffer.from(decoded, 'utf8').toString('base64url') !== segment) {
      throw new Error('not canonical');
    }
    const value: unknown = JSON.parse(decoded);
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      throw new Error('not an object');
    }
    return value as Record<string, unknown>;
  } catch {
    throw new Error(`Minder assertion ${name} is invalid.`);
  }
}

function isBase64UrlSegment(segment: string): boolean {
  return /^[A-Za-z0-9_-]+$/u.test(segment);
}
