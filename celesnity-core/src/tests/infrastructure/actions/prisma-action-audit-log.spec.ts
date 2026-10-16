import { PrismaActionAuditLog } from '@infrastructure/actions/prisma-action-audit-log';
import type { ActionActor } from '@application/actions/action.types';
import type { AuditLogEntry } from '@application/actions/audit-log-entry.model';
import type { IAuditLogRepository } from '@application/actions/interfaces/i-audit-log.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';

const actor: ActionActor = { source: 'agent', runId: 'run-1', identityId: null };

function buildAuditLog(
  create: (entry: AuditLogEntry) => Promise<AuditLogEntry> = (entry) => Promise.resolve(entry),
): { auditLog: PrismaActionAuditLog; repository: IAuditLogRepository } {
  const repository: IAuditLogRepository = {
    create: jest.fn(create),
    list: jest.fn(async () => []),
  };
  const clock: IClock = { now: () => new Date('2026-08-25T00:00:00.000Z') };
  const ids: IIdGenerator = { next: () => 'audit-1' };
  return { auditLog: new PrismaActionAuditLog(repository, clock, ids), repository };
}

describe('PrismaActionAuditLog', () => {
  it('persists a durable entry for the audited action', async () => {
    const { auditLog, repository } = buildAuditLog();

    await auditLog.record('chart.delete', actor, { chartId: 'chart-1' });

    expect(repository.create).toHaveBeenCalledWith({
      id: 'audit-1',
      actionName: 'chart.delete',
      actor,
      input: { chartId: 'chart-1' },
      createdAt: '2026-08-25T00:00:00.000Z',
    });
  });

  it('fails open when persistence throws, instead of rejecting', async () => {
    const { auditLog } = buildAuditLog(() => Promise.reject(new Error('db down')));

    await expect(auditLog.record('chart.delete', actor, {})).resolves.toBeUndefined();
  });
});
