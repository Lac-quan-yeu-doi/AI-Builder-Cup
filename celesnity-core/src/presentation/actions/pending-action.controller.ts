import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import type { AuthenticatedContext } from '@application/administration/authenticated-context';
import { isPrivileged } from '@application/administration/authorization-policy';
import { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import type { PendingActionStatus } from '@application/actions/pending-action.model';
import { tryAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import { PendingActionResponse } from './pending-action.response';

const VALID_STATUSES: readonly PendingActionStatus[] = [
  'pending',
  'approved',
  'rejected',
  'failed',
];

/**
 * AIP's "Checkpoint" pattern: review and decide on proposed actions that
 * were held for approval instead of running immediately (see
 * `chart.actions.ts` — today, only `chart.delete`).
 *
 * Deliberately carries no `ChartMutationGuard` (which accepts the agent's
 * shared token): approving/rejecting is a human decision. Whatever global
 * auth guard is already registered for the app applies here unmodified.
 *
 * `list()`'s owner scoping is real when an `AuthenticatedContext` is
 * present (see `resolveIdentityFilter`): a non-privileged human only ever
 * sees their own proposals, full stop, and can't override that via
 * `identity_id`. When no principal exists at all — dev-bypass, or the
 * shared agent token, neither of which is a real human — `actor_source`/
 * `run_id`/`identity_id` remain plain opt-in filters, not access control,
 * same as before real identity existed.
 */
@ApiTags('pending-actions')
@Controller('pending-actions')
@RequireWorkspaceFeature('HOME')
export class PendingActionController {
  public constructor(private readonly useCases: PendingActionUseCases) {}

  @Get()
  @ApiOperation({
    summary: 'List pending actions, optionally filtered by status/actor_source/run_id/identity_id',
  })
  @ApiOkResponse({ type: PendingActionResponse, isArray: true })
  public async list(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('actor_source') actorSource?: string,
    @Query('run_id') runId?: string,
    @Query('identity_id') identityIdParam?: string,
  ): Promise<readonly PendingActionResponse[]> {
    const principal = tryAuthenticatedPrincipal(req);
    const identityId = resolveIdentityFilter(principal, identityIdParam);

    const pendingActions = await this.useCases.list({
      status: parseStatus(status),
      actorSource,
      runId,
      identityId,
    });
    return PendingActionResponse.fromList(pendingActions);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single pending action' })
  @ApiOkResponse({ type: PendingActionResponse })
  public async findById(@Param('id') id: string): Promise<PendingActionResponse> {
    const pendingAction = await this.useCases.findById(id);
    return PendingActionResponse.from(pendingAction);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a pending action: runs it now' })
  @ApiOkResponse({ type: PendingActionResponse })
  public async approve(@Param('id') id: string): Promise<PendingActionResponse> {
    const pendingAction = await this.useCases.approve(id);
    return PendingActionResponse.from(pendingAction);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending action: it never runs' })
  @ApiOkResponse({ type: PendingActionResponse })
  public async reject(@Param('id') id: string): Promise<PendingActionResponse> {
    const pendingAction = await this.useCases.reject(id);
    return PendingActionResponse.from(pendingAction);
  }
}

/**
 * A non-privileged human is always scoped to their own proposals — they
 * cannot ask for anyone else's `identity_id`, even their own restated (that
 * degenerates to the same filter, so it's allowed rather than special-cased
 * out). A privileged role (org admin/owner, platform admin, support,
 * auditor — see `isPrivileged`) can pass `identity_id` to look up a
 * specific person's proposals, or omit it to see everything, mirroring
 * AIP's admin-oversight capability over per-user Checkpoint visibility.
 * With no `AuthenticatedContext` at all (dev-bypass, shared agent token —
 * neither is a real human), the param is a plain opt-in filter.
 */
function resolveIdentityFilter(
  principal: AuthenticatedContext | undefined,
  identityIdParam: string | undefined,
): string | undefined {
  if (!principal) return identityIdParam;
  if (isPrivileged(principal.role)) return identityIdParam;
  if (identityIdParam !== undefined && identityIdParam !== principal.identityId) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'You may only list your own pending actions.',
      details: null,
    });
  }
  return principal.identityId;
}

function parseStatus(status: string | undefined): PendingActionStatus | undefined {
  if (status === undefined) return undefined;
  if (!VALID_STATUSES.includes(status as PendingActionStatus)) {
    throw new BadRequestException({
      code: 'INVALID_STATUS',
      message: `status must be one of: ${VALID_STATUSES.join(', ')}`,
      details: null,
    });
  }
  return status as PendingActionStatus;
}
