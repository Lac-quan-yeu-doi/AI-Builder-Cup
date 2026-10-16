import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { IAuditLogRepository } from '@application/actions/interfaces/i-audit-log.repository';
import { AUDIT_LOG_REPOSITORY } from '@application/actions/tokens';
import { AuditLogEntryResponse } from './audit-log.response';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

/**
 * Read-only view onto the durable audit trail `PrismaActionAuditLog`
 * writes to for every `auditRequired: true` action (see `chart.actions.ts`).
 * No guard here for the same reason as `PendingActionController`: reading
 * an audit trail is not itself a mutation, so whatever global auth guard
 * is already registered for the app applies here unmodified.
 */
@ApiTags('audit-log')
@Controller('audit-log')
@RequireWorkspaceFeature('ADMINISTRATION')
export class AuditLogController {
  public constructor(
    @Inject(AUDIT_LOG_REPOSITORY) private readonly repository: IAuditLogRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries, optionally filtered by action name' })
  @ApiOkResponse({ type: AuditLogEntryResponse, isArray: true })
  public async list(
    @Query('action_name') actionName?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<readonly AuditLogEntryResponse[]> {
    const entries = await this.repository.list({
      actionName,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return AuditLogEntryResponse.fromList(entries);
  }
}
