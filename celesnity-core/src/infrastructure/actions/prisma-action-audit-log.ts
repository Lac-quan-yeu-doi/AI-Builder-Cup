import { Injectable, Logger } from '@nestjs/common';

import type { ActionActor } from '@application/actions/action.types';
import type { IActionAuditLog } from '@application/actions/interfaces/i-action-audit-log';
import type { IAuditLogRepository } from '@application/actions/interfaces/i-audit-log.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';

/**
 * Persists every audited action so a bad write can actually be traced back
 * to the actor (and, for agent-originated calls, the run) that made it —
 * `ConsoleActionAuditLog`, this class's predecessor, only ever logged to
 * stdout, which isn't a queryable record.
 *
 * Fails open: a write to the audit table must never block or fail the
 * action it's auditing, so a persistence error is logged and swallowed
 * rather than thrown.
 */
@Injectable()
export class PrismaActionAuditLog implements IActionAuditLog {
  private readonly logger = new Logger('ActionAudit');

  public constructor(
    private readonly repository: IAuditLogRepository,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
  ) {}

  public async record(actionName: string, actor: ActionActor, input: unknown): Promise<void> {
    this.logger.log(
      `action=${actionName} source=${actor.source}` + (actor.runId ? ` run_id=${actor.runId}` : ''),
    );

    try {
      await this.repository.create({
        id: this.ids.next(),
        actionName,
        actor,
        input,
        createdAt: this.clock.now().toISOString(),
      });
    } catch (err) {
      this.logger.error(
        `Failed to persist audit log entry for action=${actionName}: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      );
    }
  }
}
