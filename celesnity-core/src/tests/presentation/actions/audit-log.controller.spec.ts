import { AuditLogController } from '@presentation/actions/audit-log.controller';
import type { AuditLogEntry } from '@application/actions/audit-log-entry.model';
import type {
  AuditLogListFilter,
  IAuditLogRepository,
} from '@application/actions/interfaces/i-audit-log.repository';

const entry: AuditLogEntry = {
  id: 'audit-1',
  actionName: 'chart.delete',
  actor: { source: 'agent', runId: 'run-1', identityId: null },
  input: { chartId: 'chart-1' },
  createdAt: '2026-08-25T00:00:00.000Z',
};

function buildController(): {
  controller: AuditLogController;
  calls: (AuditLogListFilter | undefined)[];
} {
  const calls: (AuditLogListFilter | undefined)[] = [];
  const repository: IAuditLogRepository = {
    create: jest.fn(async (e) => e),
    list: jest.fn(async (filter) => {
      calls.push(filter);
      return [entry];
    }),
  };
  return { controller: new AuditLogController(repository), calls };
}

describe('AuditLogController', () => {
  it('lists entries, mapping query params to the repository filter', async () => {
    const { controller, calls } = buildController();

    const result = await controller.list('chart.delete', 'cursor-1', '10');

    expect(calls).toEqual([{ actionName: 'chart.delete', cursor: 'cursor-1', limit: 10 }]);
    expect(result).toEqual([
      {
        id: 'audit-1',
        action_name: 'chart.delete',
        actor: { source: 'agent', runId: 'run-1', identityId: null },
        input: { chartId: 'chart-1' },
        created_at: '2026-08-25T00:00:00.000Z',
      },
    ]);
  });

  it('omits filter fields that were not provided', async () => {
    const { controller, calls } = buildController();

    await controller.list();

    expect(calls).toEqual([{ actionName: undefined, cursor: undefined, limit: undefined }]);
  });
});
