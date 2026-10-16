import { createPublicKey, verify } from "node:crypto";
import {
  createAuthenticatedPrincipal,
  type AuthenticatedPrincipal,
  type OrganizationRole,
  type WorkspaceFeature,
} from "./principal.js";
import {
  AssertionAuthenticationError,
  type AssertionReplayCache,
} from "./replay-cache.js";
import type { RequestAuthenticator } from "@application/shared/ports/auth/authentication.js";
export type { RequestAuthenticator } from "@application/shared/ports/auth/authentication.js";

const MAX_ASSERTION_TTL_SECONDS = 60;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ROLES = new Set<OrganizationRole>([
  "PLATFORM_ADMIN",
  "SUPPORT",
  "ORG_OWNER",
  "ORG_ADMIN",
  "DATA_ENGINEER",
  "ANALYST",
  "VIEWER",
  "AUDITOR",
  "SERVICE_ACCOUNT",
]);
const FEATURES = new Set<WorkspaceFeature>([
  "HOME",
  "SKILLS",
  "CONNECTIONS",
  "STREAMING",
  "DEVICES",
  "SOURCE_SCHEMA",
  "CRAWLER",
  "PIPELINES",
  "EXECUTIONS",
  "AUTOMATIONS",
  "CATALOG_DATABASES",
  "CATALOG_TABLES",
  "QUERY",
  "PLANT_MODEL",
  "ANALYTICS",
  "DOCUMENTS",
  "GUIDE",
  "ADMINISTRATION",
]);

export interface CoreAssertionAuthenticatorOptions {
  readonly issuer: "celesnity-core";
  readonly audience: "minder-agent";
  readonly publicKeys: Readonly<Record<string, string>>;
  readonly replayCache: AssertionReplayCache;
  readonly now: () => number;
}

export class CoreAssertionAuthenticator implements RequestAuthenticator {
  private readonly publicKeys: ReadonlyMap<
    string,
    ReturnType<typeof createPublicKey>
  >;

  public constructor(
    private readonly options: CoreAssertionAuthenticatorOptions,
  ) {
    const keys = new Map<string, ReturnType<typeof createPublicKey>>();
    for (const [kid, pem] of Object.entries(options.publicKeys)) {
      if (!isKeyId(kid))
        throw new Error("Core assertion public key ID is invalid.");
      const key = createPublicKey(pem);
      if (key.asymmetricKeyType !== "ed25519") {
        throw new Error("Core assertion public keys must be Ed25519.");
      }
      keys.set(kid, key);
    }
    if (keys.size === 0)
      throw new Error("At least one Core assertion public key is required.");
    this.publicKeys = keys;
  }

  public async authenticate(
    headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  ): Promise<AuthenticatedPrincipal> {
    await Promise.resolve();
    try {
      const token = bearerToken(headers);
      const [headerSegment, payloadSegment, signatureSegment, extraSegment] =
        token.split(".");
      if (
        headerSegment === undefined ||
        payloadSegment === undefined ||
        signatureSegment === undefined ||
        extraSegment !== undefined ||
        !isBase64UrlSegment(headerSegment) ||
        !isBase64UrlSegment(payloadSegment) ||
        !isBase64UrlSegment(signatureSegment)
      ) {
        throw unauthenticated();
      }
      const header = jsonObject(headerSegment);
      if (
        header.alg !== "EdDSA" ||
        header.typ !== "MINDER-ASSERTION" ||
        header.v !== 1 ||
        typeof header.kid !== "string" ||
        !isKeyId(header.kid)
      ) {
        throw unauthenticated();
      }
      const publicKey = this.publicKeys.get(header.kid);
      if (publicKey === undefined) throw unauthenticated();
      if (
        !verify(
          null,
          Buffer.from(`${headerSegment}.${payloadSegment}`, "utf8"),
          publicKey,
          Buffer.from(signatureSegment, "base64url"),
        )
      ) {
        throw unauthenticated();
      }
      const claims = parseClaims(
        jsonObject(payloadSegment),
        this.options,
        this.options.now(),
      );
      await this.options.replayCache.consume(
        claims.jti,
        claims.exp,
        this.options.now(),
      );
      return claims.principal;
    } catch (error) {
      if (error instanceof AssertionAuthenticationError) throw error;
      throw unauthenticated();
    }
  }
}

function parseClaims(
  value: Record<string, unknown>,
  options: CoreAssertionAuthenticatorOptions,
  nowSeconds: number,
): {
  readonly jti: string;
  readonly exp: number;
  readonly principal: AuthenticatedPrincipal;
} {
  if (value.iss !== options.issuer || value.aud !== options.audience)
    throw unauthenticated();
  const subject = boundedString("sub", value.sub);
  const identityTenantId = boundedString("tenant_id", value.tenant_id);
  const organizationId = boundedString(
    "organization_id",
    value.organization_id,
  );
  const identityId = boundedString("identity_id", value.identity_id);
  const membershipId = boundedString("membership_id", value.membership_id);
  if (
    typeof value.role !== "string" ||
    !ROLES.has(value.role as OrganizationRole)
  )
    throw unauthenticated();
  if (typeof value.mfa_verified !== "boolean") throw unauthenticated();
  const visibleFeatures = parseFeatures(value.visible_features);
  const permissions = value.permissions ?? [];
  if (
    !Array.isArray(permissions) ||
    permissions.some(
      (permission) =>
        typeof permission !== "string" ||
        ![
          "workspace:read",
          "workspace:write",
          "organization:read",
          "organization:manage",
          "audit:read",
          "support:access",
        ].includes(permission),
    )
  )
    throw unauthenticated();
  const authTime = numericDate("auth_time", value.auth_time);
  const issuedAt = numericDate("iat", value.iat);
  const notBefore = numericDate("nbf", value.nbf);
  const expiresAt = numericDate("exp", value.exp);
  if (
    notBefore < issuedAt ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_ASSERTION_TTL_SECONDS ||
    issuedAt > nowSeconds ||
    notBefore > nowSeconds ||
    expiresAt <= nowSeconds
  ) {
    throw unauthenticated();
  }
  if (typeof value.jti !== "string" || !UUID_V4.test(value.jti))
    throw unauthenticated();
  return {
    jti: value.jti,
    exp: expiresAt,
    principal: createAuthenticatedPrincipal({
      subject,
      identityTenantId,
      organizationId,
      identityId,
      membershipId,
      role: value.role as OrganizationRole,
      visibleFeatures,
      permissions: permissions as string[],
      mfaVerified: value.mfa_verified,
      authenticationTime: authTime,
    }),
  };
}

function bearerToken(
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
): string {
  const value = headers.authorization ?? headers.Authorization;
  if (typeof value !== "string" || !value.startsWith("Bearer "))
    throw unauthenticated();
  const token = value.slice("Bearer ".length).trim();
  if (token === "" || /\s/u.test(token)) throw unauthenticated();
  return token;
}

function parseFeatures(value: unknown): readonly WorkspaceFeature[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) throw unauthenticated();
  const features: WorkspaceFeature[] = [];
  for (const feature of value) {
    if (
      typeof feature !== "string" ||
      !FEATURES.has(feature as WorkspaceFeature)
    ) {
      throw unauthenticated();
    }
    if (features.includes(feature as WorkspaceFeature)) throw unauthenticated();
    features.push(feature as WorkspaceFeature);
  }
  return Object.freeze(features);
}

function boundedString(name: string, value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    Buffer.byteLength(value, "utf8") > 128
  ) {
    throw unauthenticated();
  }
  return value;
}

function numericDate(_name: string, value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw unauthenticated();
  return value as number;
}

function jsonObject(segment: string): Record<string, unknown> {
  try {
    const decoded = Buffer.from(segment, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== segment)
      throw new Error();
    const value: unknown = JSON.parse(decoded);
    if (value === null || Array.isArray(value) || typeof value !== "object")
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw unauthenticated();
  }
}

function isKeyId(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,64}$/u.test(value);
}

function isBase64UrlSegment(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/u.test(value);
}

function unauthenticated(): AssertionAuthenticationError {
  return new AssertionAuthenticationError("unauthenticated");
}
