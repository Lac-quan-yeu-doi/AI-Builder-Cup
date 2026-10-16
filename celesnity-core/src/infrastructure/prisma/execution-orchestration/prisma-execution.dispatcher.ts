import { Injectable } from '@nestjs/common';

import { ExecutionStatus } from '@generated/prisma/enums';
import type {
  QueuedExecutionCandidate,
  IExecutionDispatcher,
} from '@application/execution-orchestration/interfaces/i-execution-dispatcher';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

/**
 * Finds executions the worker should act on.
 *
 * Prisma-backed, replacing an adapter that held its own `pg` pool to run
 * hand-written `FOR UPDATE SKIP LOCKED` statements. Once claiming moved to the
 * aggregate's guarded update, the remaining work was two ordinary indexed reads,
 * and both are expressible here. That removed roughly 160 lines of raw SQL, the
 * second outbox writer embedded in it, and one of three connection pools pointed
 * at the same database.
 *
 * Both queries are served by the `[status, queuedAt]` index on `executions`.
 */
@Injectable()
export class PrismaExecutionDispatcher implements IExecutionDispatcher {
  public constructor(private readonly prisma: PrismaService) {}

  public async listQueuedCandidates(limit: number): Promise<readonly QueuedExecutionCandidate[]> {
    if (limit < 1) {
      return [];
    }

    const rows = await this.prisma.client.execution.findMany({
      where: { status: ExecutionStatus.QUEUED },
      // Oldest first, so a backlog drains in submission order rather than
      // starving whatever arrived while the worker was busy.
      orderBy: { queuedAt: 'asc' },
      take: limit,
      select: {
        id: true,
        organizationId: true,
        workloadKind: true,
        workloadVersionNumber: true,
        scriptId: true,
        scriptVersionId: true,
        pipelineId: true,
        pipelineVersionId: true,
        databaseServiceId: true,
        authorizationIdentityId: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      workload:
        row.workloadKind === 'PIPELINE' && row.pipelineId !== null && row.pipelineVersionId !== null
          ? {
              kind: 'PIPELINE' as const,
              pipelineId: row.pipelineId,
              pipelineVersionId: row.pipelineVersionId,
              versionNumber: row.workloadVersionNumber,
            }
          : {
              kind: 'SCRIPT' as const,
              scriptId: requireSubject(row.scriptId),
              scriptVersionId: requireSubject(row.scriptVersionId),
              versionNumber: row.workloadVersionNumber,
            },
      connectionId: row.databaseServiceId ?? undefined,
      authorizationIdentityId: row.authorizationIdentityId ?? undefined,
    }));
  }

  public async listAbandonedCancellations(
    limit: number,
    excludeIds: readonly string[],
  ): Promise<readonly { readonly id: string; readonly organizationId: string }[]> {
    if (limit < 1) {
      return [];
    }

    const rows = await this.prisma.client.execution.findMany({
      where: {
        status: ExecutionStatus.CANCELLING,
        ...(excludeIds.length > 0 ? { id: { notIn: [...excludeIds] } } : {}),
      },
      // Longest-waiting first: these are already cancelled from the caller's
      // point of view, so the oldest unfinished one is the most overdue.
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: { id: true, organizationId: true },
    });

    return rows;
  }
}

function requireSubject(value: string | null): string {
  if (value === null) throw new Error('Queued execution has an invalid workload shape.');
  return value;
}
