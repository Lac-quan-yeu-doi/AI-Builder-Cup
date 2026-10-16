import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import type { ActionActor } from '@application/actions/action.types';
import { requireAuthenticatedPrincipal } from './authenticated-request';
import { RUN_ID_HEADER } from './run-id-header';

/** Request augmented with the actor this guard resolved, for `runAction`. */
export interface ChartMutationRequest extends Request {
  chartActor?: ActionActor;
}

/**
 * Chart edits use the human principal established by the global bearer guard.
 * Agent workloads must use separately guarded, tenant-bound routes; a shared
 * bearer token or unauthenticated development bypass is never accepted here.
 *
 * Resolves and attaches the calling `ActionActor` to the request — actual
 * audit logging happens in `runAction` (see `chart.actions.ts`), keyed off
 * each action's `auditRequired` flag, not here.
 */
@Injectable()
export class ChartMutationGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ChartMutationRequest>();
    const runId = request.get(RUN_ID_HEADER) ?? null;
    // BearerAuthenticationGuard has already validated user access globally
    // and run before this guard (it's registered as a global APP_GUARD), so
    // the principal it set is guaranteed present here — a missing principal
    // means that guard didn't actually run, which is a real bug worth
    // failing loudly on rather than silently treating this as anonymous.
    const principal = requireAuthenticatedPrincipal(request);
    request.chartActor = { source: 'browser', runId, identityId: principal.identityId };
    return true;
  }
}
