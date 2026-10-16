import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import { AgentWorkloadIdentityVerifier } from './agent-workload-identity.verifier';
import { AuthorizationGuard } from './authorization.guard';
import { BearerAuthenticationGuard } from './bearer-authentication.guard';

/**
 * Canonical chart REST calls require a human session. Agent chart operations
 * are executed through run-bound MCP tools, not this alternate REST path.
 */
@Injectable()
export class CanonicalChartAgentAuthGuard implements CanActivate {
  public constructor(
    private readonly bearerGuard: BearerAuthenticationGuard,
    private readonly authorizationGuard: AuthorizationGuard,
    private readonly verifier: AgentWorkloadIdentityVerifier,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = bearerToken(request.get('Authorization'));
    const workload = await this.verifier.verifyIdentity(token);
    if (workload !== null) throw unauthenticated();

    // MachineAuthenticated skips the global guards, so explicitly run the
    // normal human chain for browser requests.
    await this.bearerGuard.canActivate(context, true);
    await this.authorizationGuard.canActivate(context, true);
    return true;
  }
}

function bearerToken(value: string | undefined): string {
  return value?.startsWith('Bearer ') === true ? value.slice('Bearer '.length).trim() : '';
}

function unauthenticated(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'UNAUTHENTICATED',
    message: 'A valid delegated chart actor is required.',
    details: null,
  });
}
