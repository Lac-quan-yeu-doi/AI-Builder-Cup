import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import type { ActionActor } from '@application/actions/action.types';
import { requireAuthenticatedPrincipal } from './authenticated-request';
import { RUN_ID_HEADER } from './run-id-header';

/** Request augmented with the actor this guard resolved, for `runAction`. */
export interface AutomationMutationRequest extends Request {
  automationActor?: ActionActor;
}

/**
 * Automation mutations use the human principal established by the global
 * bearer guard — mirrors `ChartMutationGuard` exactly. Resolves and
 * attaches the calling `ActionActor` to the request; actual audit logging
 * happens in `runAction` (see `automation.actions.ts`), not here.
 */
@Injectable()
export class AutomationMutationGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AutomationMutationRequest>();
    const runId = request.get(RUN_ID_HEADER) ?? null;
    const principal = requireAuthenticatedPrincipal(request);
    request.automationActor = { source: 'browser', runId, identityId: principal.identityId };
    return true;
  }
}
