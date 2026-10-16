import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AgentWorkloadIdentityVerifier } from '@presentation/http/agent-workload-identity.verifier';
import type { AuthorizationGuard } from '@presentation/http/authorization.guard';
import type { BearerAuthenticationGuard } from '@presentation/http/bearer-authentication.guard';
import { CanonicalChartAgentAuthGuard } from '@presentation/http/canonical-chart-agent-auth.guard';

describe('CanonicalChartAgentAuthGuard', () => {
  it('rejects workload identity even when a room and caller are supplied as headers', async () => {
    const bearer = { canActivate: jest.fn() } as unknown as BearerAuthenticationGuard;
    const authorization = { canActivate: jest.fn() } as unknown as AuthorizationGuard;
    const verifier = { verifyIdentity: jest.fn().mockResolvedValue({ subject: 'agent-service' }) } as unknown as AgentWorkloadIdentityVerifier;
    const guard = new CanonicalChartAgentAuthGuard(bearer, authorization, verifier);
    const request = {
      get: (name: string) => ({
        Authorization: 'Bearer agent-token',
        'X-Chart-Delegated-Room': 'room-a',
        'X-Chart-Delegated-Subject': 'subject-a',
      })[name],
    } as unknown as Request;
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toThrow('A valid delegated chart actor is required');
    expect(bearer.canActivate).not.toHaveBeenCalled();
    expect(authorization.canActivate).not.toHaveBeenCalled();
  });
});
