import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { AgentApiChartEncodingSuggestionRepository } from '@/src/infrastructure/repositories/agent-api-chart-encoding-suggestion.repository';

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

const input = {
  userId: 'user-1',
  title: 'Monthly revenue by region',
  chartType: 'bar' as const,
  columns: ['month_start', 'region', 'revenue_usd'],
  sampleRows: [{ month_start: '2026-01-01', region: 'APAC', revenue_usd: 100 }],
};

function blockingRun(responseText: string) {
  return { status: 'completed', response_text: responseText };
}

describe('AgentApiChartEncodingSuggestionRepository.suggest', () => {
  it('submits a blocking run against the chart-encoding-inference agent with a fresh session key', async () => {
    const transport = new FakeGeneratedApiTransport(
      blockingRun(
        JSON.stringify({
          chart_type: 'line',
          encodings: {
            x: { field: 'month_start', type: 'temporal' },
            y: { field: 'revenue_usd', type: 'quantitative' },
            color: { field: 'region', type: 'nominal' },
          },
        }),
      ),
    );
    const repository = new AgentApiChartEncodingSuggestionRepository(transport);

    const result = await repository.suggest(input);

    expect(transport.requests[0]?.path).toBe('/runs');
    const body = JSON.parse(String(transport.requests[0]?.init?.body)) as Record<string, unknown>;
    expect(body.wait_ms).toBe(60_000);
    expect(body.agent).toBe('chart-encoding-inference');
    expect(body.session_key).toMatch(/^chart-encodings-/);
    expect(String(body.input)).toContain('month_start');
    expect(result).toEqual({
      chartType: 'line',
      encodings: {
        x: { field: 'month_start', type: 'temporal' },
        y: { field: 'revenue_usd', type: 'quantitative' },
        color: { field: 'region', type: 'nominal' },
      },
    });
  });

  it('omits color when the agent does not include it', async () => {
    const transport = new FakeGeneratedApiTransport(
      blockingRun(
        JSON.stringify({
          chart_type: 'bar',
          encodings: {
            x: { field: 'month_start', type: 'temporal' },
            y: { field: 'revenue_usd', type: 'quantitative' },
          },
        }),
      ),
    );
    const repository = new AgentApiChartEncodingSuggestionRepository(transport);

    const result = await repository.suggest(input);

    expect(result.encodings.color).toBeUndefined();
  });

  it('strips a markdown code fence the model adds despite instructions', async () => {
    const transport = new FakeGeneratedApiTransport(
      blockingRun(
        [
          '```json',
          JSON.stringify({
            chart_type: 'bar',
            encodings: {
              x: { field: 'month_start', type: 'temporal' },
              y: { field: 'revenue_usd', type: 'quantitative' },
            },
          }),
          '```',
        ].join('\n'),
      ),
    );
    const repository = new AgentApiChartEncodingSuggestionRepository(transport);

    const result = await repository.suggest(input);

    expect(result.chartType).toBe('bar');
  });

  it('throws when the run did not complete', async () => {
    const transport = new FakeGeneratedApiTransport({
      status: 'failed',
      response_text: null,
      error: 'boom',
    });
    const repository = new AgentApiChartEncodingSuggestionRepository(transport);

    await expect(repository.suggest(input)).rejects.toThrow(/did not complete/);
  });

  it('throws when the output is not valid JSON', async () => {
    const transport = new FakeGeneratedApiTransport(blockingRun('not json'));
    const repository = new AgentApiChartEncodingSuggestionRepository(transport);

    await expect(repository.suggest(input)).rejects.toThrow(/non-JSON/);
  });

  it('throws when the output JSON is missing required fields', async () => {
    const transport = new FakeGeneratedApiTransport(
      blockingRun(JSON.stringify({ chart_type: 'bar' })),
    );
    const repository = new AgentApiChartEncodingSuggestionRepository(transport);

    await expect(repository.suggest(input)).rejects.toThrow(/invalid shape/);
  });

  it('throws when a field name does not match a real encoding shape', async () => {
    const transport = new FakeGeneratedApiTransport(
      blockingRun(
        JSON.stringify({
          chart_type: 'not-a-real-type',
          encodings: {
            x: { field: 'month_start', type: 'temporal' },
            y: { field: 'revenue_usd', type: 'quantitative' },
          },
        }),
      ),
    );
    const repository = new AgentApiChartEncodingSuggestionRepository(transport);

    await expect(repository.suggest(input)).rejects.toThrow(/invalid shape/);
  });
});
