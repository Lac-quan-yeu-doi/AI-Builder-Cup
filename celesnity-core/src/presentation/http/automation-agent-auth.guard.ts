import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { AgentWorkloadIdentityVerifier } from './agent-workload-identity.verifier';
import { AuthorizationGuard } from './authorization.guard';
import { BearerAuthenticationGuard } from './bearer-authentication.guard';
import {
  AutomationMutationGuard,
  type AutomationMutationRequest,
} from './automation-mutation.guard';

/**
 * Automation mutation routes are shared by the browser UI and by an
 * `mcp-*` agent workload — mirrors `ChartAgentAuthGuard` exactly. Resolves
 * an agent actor directly when the bearer token is a verified
 * workload-identity token for this deployment's agent service account, or
 * otherwise re-runs the exact same checks the global guards would have
 * performed, for a human caller.
 */
@Injectable()
export class AutomationAgentAuthGuard implements CanActivate {
  public constructor(
    private readonly bearerGuard: BearerAuthenticationGuard,
    private readonly authorizationGuard: AuthorizationGuard,
    private readonly automationMutationGuard: AutomationMutationGuard,
    private readonly agentVerifier: AgentWorkloadIdentityVerifier,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AutomationMutationRequest>();
    const authorization = request.get('Authorization');
    const token =
      authorization?.startsWith('Bearer ') === true
        ? authorization.slice('Bearer '.length).trim()
        : '';

    // A workload token proves the calling binary, not its organization or
    // automation run. Agents use the run-bound MCP endpoint; the REST editing
    // surface is for an authenticated human only.
    if (token !== '' && (await this.agentVerifier.verify(token))) return false;

    // See ChartAgentAuthGuard's identical fallback for why this calls
    // `.authenticate`/`.authorize`, not `.canActivate`: this route's own
    // `@MachineAuthenticated()` metadata would otherwise make those guards'
    // `canActivate` short-circuit to `true` without checking anything.
    await this.bearerGuard.authenticate(context);
    await this.authorizationGuard.authorize(context);
    return this.automationMutationGuard.canActivate(context);
  }
}
