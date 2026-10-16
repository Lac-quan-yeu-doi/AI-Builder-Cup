import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import type { IdentityTokenVerifier } from '@application/administration/identity-token.verifier';
import type { PrismaIdentityAccessRepository } from '@infrastructure/prisma/administration/prisma-identity-access.repository';
import { requireAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { BearerAuthenticationGuard } from '@presentation/http/bearer-authentication.guard';

const principal = {
  identityId: '10000000-0000-4000-8000-000000000001',
  subject: 'subject-1',
  identityTenantId: 'tenant-apple',
  organizationId: '20000000-0000-4000-8000-000000000001',
  organizationStatus: 'ACTIVE' as const,
  membershipId: '30000000-0000-4000-8000-000000000001',
  role: 'VIEWER' as const,
  authenticationTime: 1,
  mfaVerified: true,
  mfaRequired: true,
};

function context(path: string, authorization?: string, organizationId?: string): ExecutionContext {
  const request = {
    path,
    get: (name: string) =>
      name === 'Authorization'
        ? authorization
        : name === 'X-Celesnity-Organization-Id'
          ? organizationId
          : undefined,
  };
  return {
    getHandler: () => context,
    getClass: () => BearerAuthenticationGuard,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function guard(overrides?: {
  verify?: IdentityTokenVerifier['verify'];
  resolve?: PrismaIdentityAccessRepository['resolve'];
  isPublic?: boolean;
}) {
  const verifier = {
    verify:
      overrides?.verify ??
      (async () => ({
        subject: 'subject-1',
        tenantId: 'tenant-apple',
        emailVerified: true,
        authenticationTime: 1,
        mfaVerified: true,
      })),
  };
  const identities = { resolve: overrides?.resolve ?? (async () => principal) };
  const reflector = {
    getAllAndOverride: () => overrides?.isPublic ?? false,
  } as unknown as Reflector;
  return new BearerAuthenticationGuard(
    reflector,
    verifier,
    identities as PrismaIdentityAccessRepository,
  );
}

describe('BearerAuthenticationGuard', () => {
  it.each([true, false])('enforces the resolved organization MFA policy (%s)', async (required) => {
    const instance = guard({
      verify: async () => ({
        subject: 'subject-1',
        tenantId: 'tenant-apple',
        emailVerified: true,
        authenticationTime: 1,
        mfaVerified: false,
      }),
      resolve: async () => ({ ...principal, mfaRequired: required, mfaVerified: false }),
    });
    const result = instance.canActivate(context('/api/v1/pipelines', 'Bearer password-token'));
    if (required) await expect(result).rejects.toThrow('valid, active tenant session');
    else await expect(result).resolves.toBe(true);
  });
  it('rejects anonymous and malformed authorization', async () => {
    await expect(guard().canActivate(context('/api/v1/pipelines'))).rejects.toThrow(
      'valid, active tenant session',
    );
    await expect(guard().canActivate(context('/api/v1/pipelines', 'Basic abc'))).rejects.toThrow(
      'valid, active tenant session',
    );
  });

  it('rejects a revoked user without accepting a browser-selected organization', async () => {
    const denied = guard({ resolve: async () => undefined });
    await expect(
      denied.canActivate(context('/api/v1/pipelines', 'Bearer token', principal.organizationId)),
    ).rejects.toThrow('valid, active tenant session');
  });

  it.each([{ emailVerified: false, mfaVerified: true, reason: 'unverified email' }])(
    'rejects $reason before resolving organization access',
    async (claims) => {
      const resolve = jest.fn(async () => principal);
      const denied = guard({
        verify: async () => ({
          subject: 'subject-1',
          tenantId: 'tenant-apple',
          emailVerified: claims.emailVerified,
          authenticationTime: 1,
          mfaVerified: claims.mfaVerified,
        }),
        resolve,
      });

      await expect(
        denied.canActivate(context('/api/v1/pipelines', 'Bearer token')),
      ).rejects.toThrow('valid, active tenant session');
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it('accepts a verified tenant member and ignores an organization header', async () => {
    const resolve = jest.fn(async () => principal);
    const execution = context('/api/v1/pipelines', 'Bearer token', principal.organizationId);
    await expect(guard({ resolve }).canActivate(execution)).resolves.toBe(true);
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'subject-1', tenantId: 'tenant-apple' }),
    );
    expect(requireAuthenticatedPrincipal(execution.switchToHttp().getRequest())).toEqual(principal);
  });

  it('keeps health probes unauthenticated', async () => {
    await expect(guard().canActivate(context('/health'))).resolves.toBe(true);
  });

  it('lets an unauthenticated request through when the route is marked @Public()', async () => {
    await expect(
      guard({ isPublic: true }).canActivate(context('/api/v1/charts/chart-1/embed')),
    ).resolves.toBe(true);
  });
});
