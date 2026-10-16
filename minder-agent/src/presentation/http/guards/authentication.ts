import type {
  AuthenticatedPrincipal,
  OrganizationRole,
  RequestAuthenticator,
} from "@application/shared/ports/index.js";
import { organizationScopeKey, principalScopeKey } from "@domain/index.js";
import { agentRequestAllowed } from "../common/auth/request-authorization.js";

export type OwnerHeaders = Readonly<
  Record<string, string | string[] | undefined>
>;

export interface OwnerResolverRequest {
  readonly headers: OwnerHeaders;
  readonly method?: string;
  readonly originalUrl?: string;
  readonly url?: string;
}

/**
 * The result of resolving a request's owner boundary.
 *
 * - `ok`: the request carries a valid identity; `owner` is a stable,
 *   scope-derived key suitable for tenant-isolated persistence predicates.
 * - `unauthenticated`: a Core assertion was presented but failed verification,
 *   or no acceptable identity was found. Routes answer this with 401.
 * - `missing`: no identity material at all (used to preserve the legacy
 *   `missing_caller_id` response on unauthenticated routes).
 */
export type OwnerResolution =
  | {
      readonly kind: "ok";
      readonly owner: string;
      /** Existing user-compatible owner used for runtime persistence. */
      readonly resourceOwner: string;
      /** Organization-shared manifest workspace owner, when assertion-authenticated. */
      readonly manifestOwner?: string;
      /** Subject taken from a verified Core assertion or development caller ID. */
      readonly callerSubject: string;
      readonly identityTenantId?: string;
      readonly organizationId?: string;
      readonly identityId?: string;
      readonly role?: OrganizationRole;
      readonly restrictedAgent?: string;
    }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "forbidden" }
  | { readonly kind: "missing" };

export interface OwnerResolverOptions {
  /**
   * When configured, a `Bearer` Core assertion is the only trusted identity
   * source and `X-Caller-Id` can never establish identity. When omitted, the
   * development `X-Caller-Id` fallback is used so local and test flows work
   * without minting assertions.
   */
  readonly authenticator?: RequestAuthenticator;
}

/**
 * Resolve the owner boundary for a request. A `Bearer` token is always routed
 * through the Core assertion authenticator (when configured); its verified
 * `PrincipalScope` is reduced to a stable key via {@link principalScopeKey}, so
 * the same identity in different organizations produces different owners and
 * foreign resources stay indistinguishable from missing ones. Spoofed or
 * malformed assertions fail closed as `unauthenticated`.
 */
export async function resolveOwner(
  request: OwnerResolverRequest,
  options: OwnerResolverOptions = {},
): Promise<OwnerResolution> {
  return resolveOwnerHeaders(request.headers, options, {
    method: request.method ?? "GET",
    url: request.originalUrl ?? request.url ?? "/",
  });
}

export async function resolveOwnerHeaders(
  headers: OwnerHeaders,
  options: OwnerResolverOptions = {},
  authorizationContext?: {
    readonly method: string;
    readonly url: string;
  },
): Promise<OwnerResolution> {
  const authorization = headers.authorization;
  if (options.authenticator && hasBearer(authorization)) {
    try {
      const principal = await options.authenticator.authenticate(headers);
      if (
        authorizationContext !== undefined &&
        !agentRequestAllowed(
          principal,
          authorizationContext.method,
          authorizationContext.url,
        )
      )
        return { kind: "forbidden" };
      return ownerResolution(principal);
    } catch {
      return { kind: "unauthenticated" };
    }
  }
  // A configured authenticator makes Core assertions mandatory: a Bearer-less
  // request cannot fall back to X-Caller-Id.
  if (options.authenticator) {
    return hasBearer(authorization)
      ? { kind: "unauthenticated" }
      : { kind: "missing" };
  }
  const caller = callerHeader(headers);
  return caller
    ? {
        kind: "ok",
        owner: caller,
        resourceOwner: caller,
        callerSubject: caller,
      }
    : { kind: "missing" };
}

function ownerResolution(principal: AuthenticatedPrincipal): OwnerResolution {
  return {
    kind: "ok",
    owner: principalScopeKey(principal.scope),
    resourceOwner: principalScopeKey(principal.scope),
    manifestOwner: organizationScopeKey({
      identityTenantId: principal.scope.identityTenantId,
      organizationId: principal.scope.organizationId,
    }),
    callerSubject: principal.subject,
    identityTenantId: principal.scope.identityTenantId,
    organizationId: principal.scope.organizationId,
    identityId: principal.scope.identityId,
    role: principal.role,
    ...(principal.visibleFeatures !== null &&
    !principal.visibleFeatures.includes("HOME") &&
    principal.visibleFeatures.includes("ANALYTICS")
      ? { restrictedAgent: "chart-encoding-inference" }
      : {}),
  };
}

export class AuthenticationGuard {
  constructor(private readonly options: OwnerResolverOptions = {}) {}

  resolve(request: OwnerResolverRequest): Promise<OwnerResolution> {
    return resolveOwner(request, this.options);
  }
}

function hasBearer(value: string | string[] | undefined): boolean {
  return typeof value === "string" && value.startsWith("Bearer ");
}

function callerHeader(headers: OwnerHeaders): string | undefined {
  const value = headers["x-caller-id"];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
