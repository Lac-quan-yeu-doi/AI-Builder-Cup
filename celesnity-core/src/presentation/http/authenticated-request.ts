import type { Request } from 'express';

import type { AuthenticatedContext } from '@application/administration/authenticated-context';

const AUTHENTICATED_PRINCIPAL = Symbol('celesnity.authenticatedPrincipal');

type RequestWithPrincipal = Request & {
  [AUTHENTICATED_PRINCIPAL]?: AuthenticatedContext;
};

/**
 * Carries the verified principal between Nest guards and interceptors. The
 * carrier is request-local; unlike AsyncLocalStorage it is not affected by the
 * asynchronous boundary inside the authentication guard.
 */
export function setAuthenticatedPrincipal(request: Request, principal: AuthenticatedContext): void {
  Object.defineProperty(request, AUTHENTICATED_PRINCIPAL, {
    configurable: false,
    enumerable: false,
    value: Object.freeze(principal),
    writable: false,
  });
}

export function requireAuthenticatedPrincipal(request: Request): AuthenticatedContext {
  const principal = tryAuthenticatedPrincipal(request);
  if (principal === undefined) throw new Error('Authenticated organization context is required');
  return principal;
}

/**
 * Non-throwing counterpart to `requireAuthenticatedPrincipal`, for call
 * sites that run whether or not `BearerAuthenticationGuard` is active —
 * e.g. dev-bypass mode, or a shared agent token that isn't tied to a
 * specific human. `undefined` means "no real per-user identity for this
 * request," not an error.
 */
export function tryAuthenticatedPrincipal(request: Request): AuthenticatedContext | undefined {
  return (request as RequestWithPrincipal)[AUTHENTICATED_PRINCIPAL];
}
