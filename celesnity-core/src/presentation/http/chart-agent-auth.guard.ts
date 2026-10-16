import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { AgentWorkloadIdentityVerifier } from './agent-workload-identity.verifier';
import { AuthorizationGuard } from './authorization.guard';
import { BearerAuthenticationGuard } from './bearer-authentication.guard';
import { ChartMutationGuard, type ChartMutationRequest } from './chart-mutation.guard';

/**
 * Chart REST mutations are human-only. Agent charts use the run-bound MCP
 * endpoint, so a workload credential alone cannot bypass the selected scope.
 */
@Injectable()
export class ChartAgentAuthGuard implements CanActivate {
  public constructor(
    private readonly bearerGuard: BearerAuthenticationGuard,
    private readonly authorizationGuard: AuthorizationGuard,
    private readonly chartMutationGuard: ChartMutationGuard,
    private readonly agentVerifier: AgentWorkloadIdentityVerifier,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ChartMutationRequest>();
    const authorization = request.get('Authorization');
    const token =
      authorization?.startsWith('Bearer ') === true
        ? authorization.slice('Bearer '.length).trim()
        : '';

    if (token !== '' && (await this.agentVerifier.verify(token))) return false;

    // Not an agent workload token — fall back to the same checks the global
    // guards would have performed had `@MachineAuthenticated()` not skipped
    // them for this route. Calling `.authenticate`/`.authorize` (not
    // `.canActivate`) matters: this route's own `@MachineAuthenticated()`
    // metadata would make `canActivate` short-circuit to `true` without
    // checking anything, since it can't tell "the global guard chain skipped
    // me" from "a guard standing in for the global chain called me directly."
    await this.bearerGuard.authenticate(context);
    await this.authorizationGuard.authorize(context);
    return this.chartMutationGuard.canActivate(context);
  }
}
