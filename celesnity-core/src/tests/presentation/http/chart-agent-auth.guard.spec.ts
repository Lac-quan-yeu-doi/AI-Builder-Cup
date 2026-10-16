import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { AgentWorkloadIdentityVerifier } from '@presentation/http/agent-workload-identity.verifier';
import { AuthorizationGuard } from '@presentation/http/authorization.guard';
import { BearerAuthenticationGuard } from '@presentation/http/bearer-authentication.guard';
import { MACHINE_AUTHENTICATED } from '@presentation/http/machine-authenticated.decorator';
import { ChartAgentAuthGuard } from '@presentation/http/chart-agent-auth.guard';
import {
  ChartMutationGuard,
  type ChartMutationRequest,
} from '@presentation/http/chart-mutation.guard';

function context(
  authorization?: string,
  runId?: string,
): {
  executionContext: ExecutionContext;
  request: ChartMutationRequest;
} {
  const request = {
    get: (name: string) => {
      if (name === 'Authorization') return authorization;
      if (name === 'x-minder-run-id') return runId;
      return undefined;
    },
  } as unknown as ChartMutationRequest;
  const executionContext = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { executionContext, request };
}

function makeGuard(overrides?: {
  verify?: AgentWorkloadIdentityVerifier['verify'];
  bearerAuthenticate?: BearerAuthenticationGuard['authenticate'];
  authorizationAuthorize?: AuthorizationGuard['authorize'];
  chartMutationActivate?: ChartMutationGuard['canActivate'];
}) {
  const bearerGuard = {
    authenticate: overrides?.bearerAuthenticate ?? jest.fn(async () => undefined),
  } as unknown as BearerAuthenticationGuard;
  const authorizationGuard = {
    authorize: overrides?.authorizationAuthorize ?? jest.fn(async () => undefined),
  } as unknown as AuthorizationGuard;
  const chartMutationGuard: ChartMutationGuard = {
    canActivate: overrides?.chartMutationActivate ?? jest.fn(() => true),
  };
  const agentVerifier = {
    verify: overrides?.verify ?? jest.fn(async () => false),
  } as unknown as AgentWorkloadIdentityVerifier;

  return {
    guard: new ChartAgentAuthGuard(
      bearerGuard,
      authorizationGuard,
      chartMutationGuard,
      agentVerifier,
    ),
    bearerGuard,
    authorizationGuard,
    chartMutationGuard,
    agentVerifier,
  };
}

describe('ChartAgentAuthGuard', () => {
  it('rejects a verified workload token on the human chart REST surface', async () => {
    const verify = jest.fn(async () => true);
    const { guard, bearerGuard, authorizationGuard } = makeGuard({ verify });
    const { executionContext, request } = context('Bearer real-agent-token', 'run-1');

    await expect(guard.canActivate(executionContext)).resolves.toBe(false);

    expect(verify).toHaveBeenCalledWith('real-agent-token');
    expect(request.chartActor).toBeUndefined();
    expect(bearerGuard.authenticate).not.toHaveBeenCalled();
    expect(authorizationGuard.authorize).not.toHaveBeenCalled();
  });

  it('rejects a workload token even without a run header', async () => {
    const { guard } = makeGuard({ verify: async () => true });
    const { executionContext, request } = context('Bearer real-agent-token');

    await expect(guard.canActivate(executionContext)).resolves.toBe(false);
    expect(request.chartActor).toBeUndefined();
  });

  it('falls back to the human auth chain when the token does not verify as an agent', async () => {
    const { guard, bearerGuard, authorizationGuard, chartMutationGuard } = makeGuard({
      verify: async () => false,
    });
    const { executionContext } = context('Bearer human-session-token');

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);

    expect(bearerGuard.authenticate).toHaveBeenCalledWith(executionContext);
    expect(authorizationGuard.authorize).toHaveBeenCalledWith(executionContext);
    expect(chartMutationGuard.canActivate).toHaveBeenCalledWith(executionContext);
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

describe('ChartAgentAuthGuard — human fallback against the real collaborator guards', () => {
  // These routes carry @MachineAuthenticated() (to skip the *global* guard
  // chain in favor of this guard) plus @UseGuards(ChartAgentAuthGuard). If the
  // fallback re-invokes BearerAuthenticationGuard/AuthorizationGuard's own
  // canActivate(), those guards see that same @MachineAuthenticated()
  // metadata on the very same handler and short-circuit to `true` without
  // authenticating anyone — so a real browser session never gets a
  // chartActor, and ChartMutationGuard then throws. A human bearer token
  // must still authenticate here.
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
    const chartMutationGuard = new ChartMutationGuard();
    const agentVerifier = { verify: async () => false } as unknown as AgentWorkloadIdentityVerifier;
    return new ChartAgentAuthGuard(
      bearerGuard,
      authorizationGuard,
      chartMutationGuard,
      agentVerifier,
    );
  }

  it('authenticates a human browser bearer token on a route marked @MachineAuthenticated()', async () => {
    const guard = realGuard();
    const request = {
      get: (name: string) => (name === 'Authorization' ? 'Bearer human-session-token' : undefined),
    } as unknown as ChartMutationRequest;
    const executionContext = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);

    expect(request.chartActor).toEqual({
      source: 'browser',
      runId: null,
      identityId: principal.identityId,
    });
  });
});
