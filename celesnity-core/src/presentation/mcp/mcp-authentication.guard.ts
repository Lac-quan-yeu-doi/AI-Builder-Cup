import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AgentWorkloadIdentityVerifier } from '@presentation/http/agent-workload-identity.verifier';
import { McpSharedSecretGuard } from './mcp-shared-secret.guard';
import type { AgentWorkloadIdentity } from '@application/administration/agent-service-access.repository';

export interface VerifiedMcpRequest extends Request {
  verifiedAgentWorkload?: AgentWorkloadIdentity;
}

/** GCP deployments require workload identity; local Docker has no metadata server. */
@Injectable()
export class McpAuthenticationGuard implements CanActivate {
  private readonly production: boolean;
  public constructor(
    config: ConfigService,
    private readonly verifier: AgentWorkloadIdentityVerifier,
    private readonly localSecret: McpSharedSecretGuard,
  ) {
    this.production = config.getOrThrow<string>('NODE_ENV') === 'production';
  }

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<VerifiedMcpRequest>();
    const authorization = request.get('Authorization');
    if (authorization !== undefined) {
      if (!authorization.startsWith('Bearer ')) return false;
      const identity = await this.verifier.verifyIdentity(authorization.slice(7).trim());
      if (identity === null) return false;
      request.verifiedAgentWorkload = identity;
      return true;
    }
    return !this.production && this.localSecret.canActivate(context);
  }
}
