import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { MinderPrincipalAssertionIssuer } from '@application/administration/minder-principal-assertion';

export type MinderAgentRequestHeaders = Readonly<{
  Authorization: string;
}>;

export function createMinderAgentAuth(
  contexts: AuthenticatedContextStore,
  issuer: MinderPrincipalAssertionIssuer,
  nowSeconds: () => number = () => Math.floor(Date.now() / 1_000),
): MinderAgentRequestHeaders {
  const context = contexts.require();
  return {
    Authorization: `Bearer ${issuer.issue(context, nowSeconds())}`,
  };
}

export function createMinderAgentRequestHeaders(
  contexts: AuthenticatedContextStore | undefined,
  issuer: MinderPrincipalAssertionIssuer | undefined,
  fallbackCallerId: string | undefined,
): Readonly<Record<string, string>> {
  if (contexts !== undefined && issuer !== undefined) {
    return createMinderAgentAuth(contexts, issuer);
  }
  if (process.env.NODE_ENV === 'test' && fallbackCallerId !== undefined) {
    return { 'X-Caller-Id': fallbackCallerId };
  }
  throw new Error('Minder assertion authentication is not configured');
}
