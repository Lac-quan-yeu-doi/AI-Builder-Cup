import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  AuthenticatedContextStore,
  type AuthenticatedContext,
  type OrganizationRole,
} from '@application/administration/authenticated-context';
import { setAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { AuthorizationGuard } from '@presentation/http/authorization.guard';
import { roleAllows } from '@application/administration/authorization-policy';
import { REQUIRED_WORKSPACE_FEATURES } from '@presentation/http/required-workspace-feature.decorator';

function execution(
  method: string,
  principal: Parameters<typeof setAuthenticatedPrincipal>[1],
): ExecutionContext {
  const request = { method, path: '/api/v1/pipelines', get: () => undefined };
  setAuthenticatedPrincipal(request as never, principal);
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

function guard(role: OrganizationRole, mfaVerified = true, mfaRequired = true) {
  const contexts = new AuthenticatedContextStore();
  const audit = { write: jest.fn().mockResolvedValue(undefined) };
  const principal: AuthenticatedContext = {
    identityId: '1',
    subject: 'subject',
    identityTenantId: 'tenant-apple',
    organizationId: '2',
    organizationStatus: 'ACTIVE',
    membershipId: '3',
    role,
    authenticationTime: 1,
    mfaVerified,
    mfaRequired,
  };
  return {
    guard: new AuthorizationGuard(new Reflector(), contexts, audit),
    audit,
    principal,
  };
}

describe('AuthorizationGuard', () => {
  it('allows Analysts to author workspace assets without broadening Viewer permissions', () => {
    expect(roleAllows('ANALYST', 'workspace:write')).toBe(true);
    expect(roleAllows('VIEWER', 'workspace:write')).toBe(false);
  });

  it.each<OrganizationRole>([
    'ORG_OWNER',
    'ORG_ADMIN',
    'VIEWER',
    'ANALYST',
    'DATA_ENGINEER',
    'AUDITOR',
  ])('requires MFA for %s after opt-in', async (role) => {
    const denied = guard(role, false, true);
    await expect(denied.guard.canActivate(execution('GET', denied.principal))).rejects.toThrow(
      'Multi-factor authentication is required',
    );
  });
  it('allows an administrator without MFA before the organization opts in', async () => {
    const allowed = guard('ORG_ADMIN', false, false);
    await expect(allowed.guard.canActivate(execution('GET', allowed.principal))).resolves.toBe(
      true,
    );
  });
  it('defaults read-only roles closed for mutations and audits the denial', async () => {
    const denied = guard('VIEWER');
    await expect(denied.guard.canActivate(execution('POST', denied.principal))).rejects.toThrow(
      'Permission workspace:write is required',
    );
    expect(denied.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'AUTHORIZATION', outcome: 'FAILED' }),
    );
    const allowed = guard('VIEWER');
    await expect(allowed.guard.canActivate(execution('GET', allowed.principal))).resolves.toBe(
      true,
    );
  });

  it('requires both the role permission and the declared workspace feature', async () => {
    const contexts = new AuthenticatedContextStore();
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key) =>
        key === REQUIRED_WORKSPACE_FEATURES ? ['ANALYTICS'] : undefined,
      );
    const featureGuard = new AuthorizationGuard(reflector, contexts, audit);
    const denied = { ...guard('ANALYST').principal, visibleFeatures: ['HOME'] as const };

    await expect(featureGuard.canActivate(execution('GET', denied))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FEATURE_ACCESS_DENIED' }),
    });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          reason: 'FEATURE_ACCESS_DENIED',
          features: 'ANALYTICS',
        }),
      }),
    );

    const allowed = { ...denied, visibleFeatures: ['ANALYTICS'] as const };
    await expect(featureGuard.canActivate(execution('GET', allowed))).resolves.toBe(true);
  });

  it('does not let feature visibility broaden a read-only role', async () => {
    const contexts = new AuthenticatedContextStore();
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key) =>
        key === REQUIRED_WORKSPACE_FEATURES ? ['ANALYTICS'] : undefined,
      );
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const featureGuard = new AuthorizationGuard(reflector, contexts, audit);
    const viewer = {
      ...guard('VIEWER').principal,
      visibleFeatures: ['ANALYTICS'] as const,
    };

    await expect(featureGuard.canActivate(execution('POST', viewer))).rejects.toThrow(
      'Permission workspace:write is required',
    );
  });

  it('rejects privileged access without MFA and audits the denial', async () => {
    const denied = guard('ORG_ADMIN', false);
    await expect(denied.guard.canActivate(execution('GET', denied.principal))).rejects.toThrow(
      'Multi-factor authentication is required',
    );
    expect(denied.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ reason: 'MFA_REQUIRED' }) }),
    );
  });

  it('skips authorization entirely for a route marked @Public(), with no principal required', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const contexts = new AuthenticatedContextStore();
    const audit = { write: jest.fn() };
    const publicGuard = new AuthorizationGuard(reflector, contexts, audit);
    const noPrincipalRequest = { method: 'GET', path: '/charts/1/embed', get: () => undefined };
    const noPrincipalContext = {
      switchToHttp: () => ({ getRequest: () => noPrincipalRequest }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as unknown as ExecutionContext;

    await expect(publicGuard.canActivate(noPrincipalContext)).resolves.toBe(true);
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('fails closed when a protected route has no authenticated principal', async () => {
    const contexts = new AuthenticatedContextStore();
    const audit = { write: jest.fn() };
    const protectedGuard = new AuthorizationGuard(new Reflector(), contexts, audit);
    const request = { method: 'GET', path: '/api/v1/charts', get: () => undefined };
    const noPrincipalContext = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as unknown as ExecutionContext;

    await expect(protectedGuard.canActivate(noPrincipalContext)).rejects.toThrow(
      'Authenticated organization context is required',
    );
    expect(audit.write).not.toHaveBeenCalled();
  });
});
