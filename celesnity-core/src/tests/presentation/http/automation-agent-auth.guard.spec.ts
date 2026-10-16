import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { AgentWorkloadIdentityVerifier } from '@presentation/http/agent-workload-identity.verifier';
import { AuthorizationGuard } from '@presentation/http/authorization.guard';
import { BearerAuthenticationGuard } from '@presentation/http/bearer-authentication.guard';
import { MACHINE_AUTHENTICATED } from '@presentation/http/machine-authenticated.decorator';
import { AutomationAgentAuthGuard } from '@presentation/http/automation-agent-auth.guard';
import {
  AutomationMutationGuard,
  type AutomationMutationRequest,
} from '@presentation/http/automation-mutation.guard';

function context(
  authorization?: string,
  runId?: string,
): {
  executionContext: ExecutionContext;
  request: AutomationMutationRequest;
} {
  const request = {
    get: (name: string) => {
      if (name === 'Authorization') return authorization;
      if (name === 'x-minder-run-id') return runId;
      return undefined;
    },
  } as unknown as AutomationMutationRequest;
  const executionContext = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { executionContext, request };
}

function makeGuard(overrides?: {
  verify?: AgentWorkloadIdentityVerifier['verify'];
  bearerAuthenticate?: BearerAuthenticationGuard['authenticate'];
  authorizationAuthorize?: AuthorizationGuard['authorize'];
  automationMutationActivate?: AutomationMutationGuard['canActivate'];
}) {
  const bearerGuard = {
    authenticate: overrides?.bearerAuthenticate ?? jest.fn(async () => undefined),
  } as unknown as BearerAuthenticationGuard;
  const authorizationGuard = {
    authorize: overrides?.authorizationAuthorize ?? jest.fn(async () => undefined),
  } as unknown as AuthorizationGuard;
  const automationMutationGuard: AutomationMutationGuard = {
    canActivate: overrides?.automationMutationActivate ?? jest.fn(() => true),
  };
  const agentVerifier = {
    verify: overrides?.verify ?? jest.fn(async () => false),
  } as unknown as AgentWorkloadIdentityVerifier;

  return {
    guard: new AutomationAgentAuthGuard(
      bearerGuard,
      authorizationGuard,
      automationMutationGuard,
      agentVerifier,
    ),
    bearerGuard,
    authorizationGuard,
    automationMutationGuard,
    agentVerifier,
  };
}

describe('AutomationAgentAuthGuard', () => {
  it('rejects a verified workload token on the human REST editing surface', async () => {
    const verify = jest.fn(async () => true);
    const { guard, bearerGuard, authorizationGuard } = makeGuard({ verify });
    const { executionContext, request } = context('Bearer real-agent-token', 'run-1');

    await expect(guard.canActivate(executionContext)).resolves.toBe(false);

    expect(verify).toHaveBeenCalledWith('real-agent-token');
    expect(request.automationActor).toBeUndefined();
    expect(bearerGuard.authenticate).not.toHaveBeenCalled();
    expect(authorizationGuard.authorize).not.toHaveBeenCalled();
  });

  it('rejects a workload token even without a run header', async () => {
    const { guard } = makeGuard({ verify: async () => true });
    const { executionContext, request } = context('Bearer real-agent-token');

    await expect(guard.canActivate(executionContext)).resolves.toBe(false);
    expect(request.automationActor).toBeUndefined();
  });

  it('falls back to the human auth chain when the token does not verify as an agent', async () => {
    const { guard, bearerGuard, authorizationGuard, automationMutationGuard } = makeGuard({
      verify: async () => false,
    });
    const { executionContext } = context('Bearer human-session-token');

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);

    expect(bearerGuard.authenticate).toHaveBeenCalledWith(executionContext);
    expect(authorizationGuard.authorize).toHaveBeenCalledWith(executionContext);
    expect(automationMutationGuard.canActivate).toHaveBeenCalledWith(executionContext);
  });

  it('propagates a rejection from the human auth chain instead of silently allowing access', async () => {
    const { guard } = makeGuard({
      verify: async () => false,
      bearerAuthenticate: jest.fn(async () => {
        throw new Error('valid, active tenant session required');
      }),
    });
    const { executionContext } = context(undefined);

    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      'valid, active tenant session required',
    );
  });

  it('treats a missing Authorization header as not an agent, without calling the verifier', async () => {
    const verify = jest.fn(async () => true);
    const { guard, bearerGuard } = makeGuard({ verify });
    const { executionContext } = context(undefined);

    await guard.canActivate(executionContext);

    expect(verify).not.toHaveBeenCalled();
    expect(bearerGuard.authenticate).toHaveBeenCalled();
  });
});

describe('AutomationAgentAuthGuard — human fallback against the real collaborator guards', () => {
  // Mirrors ChartAgentAuthGuard's identical regression test: these routes
  // carry @MachineAuthenticated() + @UseGuards(AutomationAgentAuthGuard), so
  // the fallback must not re-invoke BearerAuthenticationGuard/
  // AuthorizationGuard's own canActivate() — that would see the same
  // @MachineAuthenticated() metadata and short-circuit to `true` without
  // authenticating anyone.
  const principal = {
    identityId: '10000000-0000-4000-8000-000000000001',
    subject: 'subject-1',
    identityTenantId: 'tenant-apple',
    organizationId: '20000000-0000-4000-8000-000000000001',
    organizationStatus: 'ACTIVE' as const,
    membershipId: '30000000-0000-4000-8000-000000000001',
    role: 'ORG_ADMIN' as const,
    authenticationTime: 1,
    mfaVerified: true,
    mfaRequired: false,
  };

  function realGuard() {
    const reflector = {
      getAllAndOverride: (key: string) => (key === MACHINE_AUTHENTICATED ? true : undefined),
    } as unknown as Reflector;
    const verifier = {
      verify: async () => ({
        subject: 'subject-1',
        tenantId: 'tenant-apple',
        emailVerified: true,
        authenticationTime: 1,
        mfaVerified: true,
      }),
    };
    const identities = { resolve: async () => principal };
    const bearerGuard = new BearerAuthenticationGuard(reflector, verifier, identities as never);
    const audit = { write: async () => undefined };
    const authorizationGuard = new AuthorizationGuard(
      reflector,
      new AuthenticatedContextStore(),
      audit,
    );
    const automationMutationGuard = new AutomationMutationGuard();
    const agentVerifier = { verify: async () => false } as unknown as AgentWorkloadIdentityVerifier;
    return new AutomationAgentAuthGuard(
      bearerGuard,
      authorizationGuard,
      automationMutationGuard,
      agentVerifier,
    );
  }

  it('authenticates a human browser bearer token on a route marked @MachineAuthenticated()', async () => {
    const guard = realGuard();
    const request = {
      get: (name: string) => (name === 'Authorization' ? 'Bearer human-session-token' : undefined),
    } as unknown as AutomationMutationRequest;
    const executionContext = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);

    expect(request.automationActor).toEqual({
      source: 'browser',
      runId: null,
      identityId: principal.identityId,
    });
  });
});
