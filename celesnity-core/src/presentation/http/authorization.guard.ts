import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { AUDIT_WRITER, type AuditWriter } from '@application/administration/audit-writer';
import type { Permission } from '@application/administration/authorization-policy';
import { decideAccess } from '@application/administration/access-policy';
import { requireAuthenticatedPrincipal } from './authenticated-request';
import { IS_PUBLIC } from './public.decorator';
import { REQUIRED_PERMISSION } from './required-permission.decorator';
import { MACHINE_AUTHENTICATED } from './machine-authenticated.decorator';
import type { WorkspaceFeature } from '@application/administration/workspace-feature';
import { REQUIRED_WORKSPACE_FEATURES } from './required-workspace-feature.decorator';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly contexts: AuthenticatedContextStore,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  public async canActivate(
    execution: ExecutionContext,
    ignoreMachineAuthenticated = false,
  ): Promise<boolean> {
    if (
      !ignoreMachineAuthenticated &&
      this.reflector.getAllAndOverride<boolean>(MACHINE_AUTHENTICATED, [
        execution.getHandler(),
        execution.getClass(),
      ]) === true
    )
      return true;
    const request = execution.switchToHttp().getRequest<Request>();
    if (request.path === '/health' || request.path.startsWith('/api/v1/health/')) return true;
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        execution.getHandler(),
        execution.getClass(),
      ])
    ) {
      return true;
    }
    await this.authorize(execution);
    return true;
  }

  /**
   * The actual permission check, without the `@MachineAuthenticated()`/
   * `@Public()`/health-path opt-outs above — see `BearerAuthenticationGuard
   * .authenticate`'s doc comment for why a guard that manually re-invokes
   * this one as a building block needs a path that isn't short-circuited by
   * the very route metadata it's standing in for.
   */
  public async authorize(execution: ExecutionContext): Promise<void> {
    const request = execution.switchToHttp().getRequest<Request>();
    const principal = requireAuthenticatedPrincipal(request);
    const explicit = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, [
      execution.getHandler(),
      execution.getClass(),
    ]);
    const permission = explicit ?? defaultPermission(request.method);
    const features = this.reflector.getAllAndOverride<readonly WorkspaceFeature[] | undefined>(
      REQUIRED_WORKSPACE_FEATURES,
      [execution.getHandler(), execution.getClass()],
    );
    const decision = decideAccess(principal, { permission, anyFeature: features });
    if (!decision.allowed) {
      await this.recordDenial(request, principal, permission, decision.reason, features);
      throw new ForbiddenException({
        code: decision.reason,
        message:
          decision.reason === 'MFA_REQUIRED'
            ? 'Multi-factor authentication is required by this organization.'
            : decision.reason === 'PERMISSION_DENIED'
              ? `Permission ${permission} is required.`
              : decision.reason === 'FEATURE_ACCESS_DENIED'
                ? 'The required workspace feature is not available to this account.'
                : 'The organization is not available to this account.',
        details: null,
      });
    }
  }

  private async recordDenial(
    request: Request,
    principal: ReturnType<typeof requireAuthenticatedPrincipal>,
    permission: Permission,
    reason: string,
    features?: readonly WorkspaceFeature[],
  ): Promise<void> {
    try {
      await this.contexts.run(principal, () =>
        this.audit.write({
          organizationId: principal.organizationId,
          actorIdentityId: principal.identityId,
          sessionId: principal.sessionId,
          requestId: request.get?.('X-Request-Id'),
          eventType: 'AUTHORIZATION',
          action: `${request.method} ${request.path}`.slice(0, 160),
          outcome: 'FAILED',
          metadata: {
            permission,
            reason,
            role: principal.role,
            ...(features === undefined ? {} : { features: features.join(',') }),
          },
        }),
      );
    } catch {
      /* Authorization remains fail-closed when audit persistence is unavailable. */
    }
  }
}

function defaultPermission(method: string): Permission {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
    ? 'workspace:read'
    : 'workspace:write';
}
