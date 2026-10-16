import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiPendingActionRepository } from '@/src/infrastructure/repositories/core-api-pending-action.repository';

interface RecordedRequest {
  readonly path: string;
  readonly init?: RequestInit;
}

class FakeGeneratedApiTransport implements GeneratedApiTransport {
  public readonly requests: RecordedRequest[] = [];
  private readonly responses: unknown[];

  public constructor(...responses: unknown[]) {
    this.responses = [...responses];
  }

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    const response = this.responses.shift();
    if (response instanceof Error) {
      throw response;
    }
    return response as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream() is not used by this repository');
  }
}

const dto = {
  id: 'pending-1',
  action_name: 'chart.delete',
  input: { chart_id: 'chart-1', expected_version: 3 },
  actor: { source: 'agent', runId: 'run-1', identityId: null },
  status: 'pending',
  rationale: 'Duplicate of another chart',
  result: null,
  error_message: null,
  created_at: '2026-08-25T00:00:00.000Z',
  decided_at: null,
  expires_at: '2026-08-26T00:00:00.000Z',
};

describe('CoreApiPendingActionRepository', () => {
  it('lists with no query string when the filter is empty', async () => {
    const transport = new FakeGeneratedApiTransport([dto]);
    const repository = new CoreApiPendingActionRepository(transport);

    const result = await repository.list();

    expect(transport.requests[0]).toEqual({ path: '/pending-actions', init: { method: 'GET' } });
    expect(result[0]).toEqual({
      id: 'pending-1',
      actionName: 'chart.delete',
      input: { chart_id: 'chart-1', expected_version: 3 },
      actor: { source: 'agent', runId: 'run-1', identityId: null },
      status: 'pending',
      rationale: 'Duplicate of another chart',
      result: null,
      errorMessage: null,
      createdAt: '2026-08-25T00:00:00.000Z',
      decidedAt: null,
      expiresAt: '2026-08-26T00:00:00.000Z',
    });
  });

  it('encodes status/actor_source/run_id filters as query params', async () => {
    const transport = new FakeGeneratedApiTransport([dto]);
    const repository = new CoreApiPendingActionRepository(transport);

    await repository.list({ status: 'pending', actorSource: 'agent', runId: 'run-1' });

    expect(transport.requests[0]?.path).toBe(
      '/pending-actions?status=pending&actor_source=agent&run_id=run-1',
    );
  });

  it('approves via POST /pending-actions/:id/approve', async () => {
    const transport = new FakeGeneratedApiTransport({ ...dto, status: 'approved' });
    const repository = new CoreApiPendingActionRepository(transport);

    const result = await repository.approve('pending-1');

    expect(transport.requests[0]).toEqual({
      path: '/pending-actions/pending-1/approve',
      init: { method: 'POST' },
    });
    expect(result.status).toBe('approved');
  });

  it('rejects via POST /pending-actions/:id/reject', async () => {
    const transport = new FakeGeneratedApiTransport({ ...dto, status: 'rejected' });
    const repository = new CoreApiPendingActionRepository(transport);

    const result = await repository.reject('pending-1');

    expect(transport.requests[0]).toEqual({
      path: '/pending-actions/pending-1/reject',
      init: { method: 'POST' },
    });
    expect(result.status).toBe('rejected');
  });

  it('defaults an unrecognized actor source to anonymous', async () => {
    const transport = new FakeGeneratedApiTransport({
      ...dto,
      actor: { source: 'nonsense', runId: null, identityId: null },
    });
    const repository = new CoreApiPendingActionRepository(transport);

    const result = await repository.findById('pending-1');

    expect(result.actor.source).toBe('anonymous');
  });
});
