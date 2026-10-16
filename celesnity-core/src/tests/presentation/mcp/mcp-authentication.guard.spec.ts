import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AgentWorkloadIdentityVerifier } from '@presentation/http/agent-workload-identity.verifier';
import type { McpSharedSecretGuard } from '@presentation/mcp/mcp-shared-secret.guard';
import { McpAuthenticationGuard } from '@presentation/mcp/mcp-authentication.guard';

describe('MCP workload authentication', () => {
  function setup(environment: string, header?: string) {
    const verifyIdentity = jest.fn().mockResolvedValue(null);
    const canActivate = jest.fn().mockReturnValue(true);
    const guard = new McpAuthenticationGuard(
      new ConfigService({ NODE_ENV: environment }),
      { verifyIdentity } as unknown as AgentWorkloadIdentityVerifier,
      { canActivate } as unknown as McpSharedSecretGuard,
    );
    const request: { get: () => string | undefined; verifiedAgentWorkload?: object } = {
      get: () => header,
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { guard, context, verifyIdentity, canActivate, request };
  }
  it('rejects a static secret in production', async () => {
    const { guard, context, canActivate } = setup('production');
    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(canActivate).not.toHaveBeenCalled();
  });
  it('never downgrades an invalid workload token to shared-secret authentication', async () => {
    const { guard, context, canActivate } = setup('development', 'Bearer invalid');
    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(canActivate).not.toHaveBeenCalled();
  });
  it('accepts only the verified workload token in production', async () => {
    const { guard, context, verifyIdentity, request } = setup('production', 'Bearer valid');
    const identity = { subject: 'agent', email: 'agent@example.com' };
    verifyIdentity.mockResolvedValue(identity);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyIdentity).toHaveBeenCalledWith('valid');
    expect(request.verifiedAgentWorkload).toEqual(identity);
  });
});
