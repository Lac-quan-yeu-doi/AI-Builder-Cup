import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import {
  IDENTITY_TOKEN_VERIFIER,
  type IdentityTokenVerifier,
} from '@application/administration/identity-token.verifier';
import {
  IDENTITY_ACCESS_REPOSITORY,
  type IdentityAccessRepository,
} from '@application/administration/identity-access.repository';
import { setAuthenticatedPrincipal } from './authenticated-request';
import { MACHINE_AUTHENTICATED } from './machine-authenticated.decorator';
import { IS_PUBLIC } from './public.decorator';

@Injectable()
export class BearerAuthenticationGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    @Inject(IDENTITY_TOKEN_VERIFIER) private readonly verifier: IdentityTokenVerifier,
    @Inject(IDENTITY_ACCESS_REPOSITORY) private readonly identities: IdentityAccessRepository,
  ) {}

  public async canActivate(
    context: ExecutionContext,
    ignoreMachineAuthenticated = false,
  ): Promise<boolean> {
    if (
      !ignoreMachineAuthenticated &&
      this.reflector.getAllAndOverride<boolean>(MACHINE_AUTHENTICATED, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    )
      return true;
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    )
      return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path === '/health' || request.path.startsWith('/api/v1/health/')) return true;
    await this.authenticate(context);
    return true;
  }

  /**
   * The actual token verification, without the `@MachineAuthenticated()`/
   * `@Public()`/health-path opt-outs above. Those only make sense when Nest
   * itself invokes this guard globally per-route; a guard that manually
   * re-invokes this one as a building block (`ChartAgentAuthGuard`,
   * `AutomationAgentAuthGuard` — routes that must accept EITHER an agent
   * workload token OR a human session, so they can't rely on
   * `@MachineAuthenticated()` alone) would otherwise see the *same* route
   * metadata and short-circuit to `true` without authenticating anyone,
   * leaving no principal for the checks after it.
   */
  public async authenticate(context: ExecutionContext): Promise<void> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.get('Authorization');
    const token =
      authorization?.startsWith('Bearer ') === true
        ? authorization.slice('Bearer '.length).trim()
        : '';
    if (token === '') {
      await this.recordFailure(undefined, undefined, request.get('X-Request-Id'));
      throw unauthenticated();
    }
    let subject: string | undefined;
    let tenantId: string | undefined;
    try {
      const verified = await this.verifier.verify(token);
      subject = verified.subject;
      tenantId = verified.tenantId;
      if (!verified.emailVerified) throw unauthenticated();
      const principal = await this.identities.resolve(verified);
      if (principal === undefined) throw unauthenticated();
      if (principal.mfaRequired !== false && !verified.mfaVerified) throw unauthenticated();
      setAuthenticatedPrincipal(request, principal);
    } catch (error) {
      await this.recordFailure(subject, tenantId, request.get('X-Request-Id'));
      if (error instanceof UnauthorizedException) throw error;
      throw unauthenticated();
    }
  }

  private async recordFailure(
    subject: string | undefined,
    tenantId: string | undefined,
    requestId: string | undefined,
  ): Promise<void> {
    try {
      await this.identities.recordAuthenticationFailure(subject, tenantId, requestId);
    } catch {
      /* Authentication must fail closed even if audit persistence is unavailable. */
    }
  }
}

function unauthenticated(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'UNAUTHENTICATED',
    message: 'A valid, active tenant session and organization membership are required.',
    details: null,
  });
}
