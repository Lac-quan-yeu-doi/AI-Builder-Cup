import type { Response } from 'express';

import type { Chart } from '@domain/chart/models/chart';
import type { ChartActions } from '@application/chart/chart.actions';
import { ChartController } from '@presentation/chart/chart.controller';
import type { ChartMutationRequest } from '@presentation/http/chart-mutation.guard';

const chart: Chart = {
  id: 'chart-1',
  runId: null,
  title: 'Revenue',
  chartType: 'bar',
  encodings: {},
  data: [],
  config: {},
  vlSpec: null,
  sql: null,
  status: 'ready',
  errorMessage: null,
  version: 1,
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
};

function buildController(options?: {
  notFound?: boolean;
  setData?: jest.Mock;
  create?: jest.Mock;
  propose?: jest.Mock;
}) {
  const actions = {
    findById: {
      name: 'chart.findById',
      permission: 'read',
      auditRequired: false,
      approvalRequired: false,
      run: async () => {
        if (options?.notFound === true) {
          throw new Error('chart not found');
        }
        return chart;
      },
    },
    setData: {
      name: 'chart.setData',
      permission: 'write',
      auditRequired: false,
      approvalRequired: false,
      run: options?.setData ?? (async () => chart),
    },
    create: {
      name: 'chart.create',
      permission: 'write',
      auditRequired: false,
      approvalRequired: false,
      run: options?.create ?? (async () => chart),
    },
  } as unknown as ChartActions;
  const auditLog = { record: jest.fn() };
  const realtime = {} as never;
  const useCases = {} as never;
  const pendingActions = {
    propose:
      options?.propose ??
      jest.fn(async (actionName: string) => ({
        id: 'pending-1',
        actionName,
        input: {},
        actor: { source: 'anonymous', runId: null, identityId: null },
        status: 'pending',
        rationale: null,
        result: null,
        errorMessage: null,
        createdAt: '2026-08-24T00:00:00.000Z',
        decidedAt: null,
        expiresAt: '2026-08-25T00:00:00.000Z',
      })),
  };
  const controller = new ChartController(
    actions,
    auditLog,
    realtime,
    useCases,
    pendingActions as never,
  );
  return { controller, pendingActions };
}

describe('ChartController.create', () => {
  it('creates the chart immediately when no approval override is present', async () => {
    const create = jest.fn(async () => chart);
    const { controller, pendingActions } = buildController({ create });
    const req = { headers: {} } as ChartMutationRequest;
    const res = { status: jest.fn() } as unknown as Response;

    const result = await controller.create(
      { title: 'Revenue', chart_type: 'bar', sql: 'SELECT 1' },
      req,
      res,
    );

    expect(create).toHaveBeenCalled();
    expect(pendingActions.propose).not.toHaveBeenCalled();
    expect((result as { id: string }).id).toBe('chart-1');
  });

  // Regression test: an agent manifest's `action_approvals` map is forwarded
  // as the `X-Action-Approval-Overrides` header (see
  // `action-approval-override.ts`) so a specific agent can require approval
  // for an action that's normally immediate. This previously had no effect
  // at all — `approvalOverrideFor` was parsed but never passed into
  // `runAction`, so `chart.create` always used its hardcoded
  // `approvalRequired: false` regardless of the header.
  it('proposes a pending action instead of creating immediately when the header overrides chart.create to true', async () => {
    const create = jest.fn(async () => chart);
    const { controller, pendingActions } = buildController({ create });
    const req = {
      headers: { 'x-action-approval-overrides': 'chart.create=true' },
    } as unknown as ChartMutationRequest;
    const res = { status: jest.fn() } as unknown as Response;

    const result = await controller.create(
      { title: 'Revenue', chart_type: 'bar', sql: 'SELECT 1' },
      req,
      res,
    );

    expect(create).not.toHaveBeenCalled();
    expect(pendingActions.propose).toHaveBeenCalledWith(
      'chart.create',
      expect.objectContaining({ title: 'Revenue' }),
      expect.anything(),
      null,
    );
    expect(result).toEqual({ status: 'pending_approval', pending_action_id: 'pending-1' });
    expect(res.status).toHaveBeenCalledWith(202);
  });
});

describe('ChartController.setDataFromCsv', () => {
  const req = { headers: {} } as ChartMutationRequest;
  const res = { status: jest.fn() } as unknown as Response;

  it('parses the uploaded CSV and calls chart.setData with the resulting rows', async () => {
    const setData = jest.fn(async () => chart);
    const { controller } = buildController({ setData });
    const file = { buffer: Buffer.from('month,revenue\nJan,100\n', 'utf-8') };

    const result = await controller.setDataFromCsv('chart-1', req, res, undefined, file);

    expect(setData).toHaveBeenCalledWith(
      {
        chartId: 'chart-1',
        data: [{ month: 'Jan', revenue: 100 }],
        expectedVersion: undefined,
        sql: null,
      },
      expect.objectContaining({ source: 'anonymous' }),
    );
    expect((result as { id: string }).id).toBe('chart-1');
  });

  it('parses expected_version as an integer', async () => {
    const setData = jest.fn(async () => chart);
    const { controller } = buildController({ setData });
    const file = { buffer: Buffer.from('a\n1\n', 'utf-8') };

    await controller.setDataFromCsv('chart-1', req, res, '3', file);

    expect(setData).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 3 }),
      expect.anything(),
    );
  });

  it('rejects the request when no file is attached', async () => {
    const { controller } = buildController();

    await expect(
      controller.setDataFromCsv('chart-1', req, res, undefined, undefined),
    ).rejects.toThrow('A file is required');
  });

  it('propagates a CSV parsing error instead of calling chart.setData', async () => {
    const setData = jest.fn(async () => chart);
    const { controller } = buildController({ setData });
    const file = { buffer: Buffer.from('a,b\n', 'utf-8') }; // header only, no data rows

    await expect(controller.setDataFromCsv('chart-1', req, res, undefined, file)).rejects.toThrow(
      'no data rows',
    );
    expect(setData).not.toHaveBeenCalled();
  });
});
