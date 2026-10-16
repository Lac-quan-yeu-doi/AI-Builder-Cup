import { describe, expect, it } from 'vitest';

import { ConflictError } from '@/src/entities/errors/application-errors';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiChartRepository } from '@/src/infrastructure/repositories/core-api-chart.repository';

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

const chartDto = {
  id: 'chart-1',
  run_id: null,
  title: 'Sales',
  chart_type: 'bar',
  encodings: {},
  data: [{ region: 'west', total: 12 }],
  config: {},
  vl_spec: null,
  sql: null,
  status: 'ready',
  error_message: null,
  version: 2,
  created_at: '2026-08-25T00:00:00.000Z',
  updated_at: '2026-08-25T00:00:01.000Z',
};

describe('CoreApiChartRepository.setDataFromCsv', () => {
  it('posts a multipart form with the file under field "file"', async () => {
    const transport = new FakeGeneratedApiTransport(chartDto);
    const repository = new CoreApiChartRepository(transport);
    const file = new File(['region,total\nwest,12'], 'data.csv', { type: 'text/csv' });

    const result = await repository.setDataFromCsv('chart-1', file, 4);

    expect(transport.requests[0]?.path).toBe('/charts/chart-1/data/csv?expected_version=4');
    expect(transport.requests[0]?.init?.method).toBe('POST');
    const body = transport.requests[0]?.init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBe(file);
    expect(result).toEqual({
      id: 'chart-1',
      runId: null,
      title: 'Sales',
      chartType: 'bar',
      encodings: {},
      data: [{ region: 'west', total: 12 }],
      config: {},
      vlSpec: null,
      sql: null,
      status: 'ready',
      errorMessage: null,
      version: 2,
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:01.000Z',
    });
  });

  it('translates a version-conflict response into ConflictError', async () => {
    const transport = new FakeGeneratedApiTransport(
      new CoreApiError(409, 'Chart changed elsewhere.'),
    );
    const repository = new CoreApiChartRepository(transport);
    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });

    await expect(repository.setDataFromCsv('chart-1', file, 1)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('surfaces the backend rejection message for a malformed CSV', async () => {
    const transport = new FakeGeneratedApiTransport(
      new CoreApiError(400, 'Could not parse CSV: bad row.'),
    );
    const repository = new CoreApiChartRepository(transport);
    const file = new File(['not,a,csv'], 'data.csv', { type: 'text/csv' });

    await expect(repository.setDataFromCsv('chart-1', file, 1)).rejects.toThrow(
      'Could not parse CSV: bad row.',
    );
  });
});
