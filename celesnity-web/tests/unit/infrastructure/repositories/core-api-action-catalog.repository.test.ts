import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiActionCatalogRepository } from '@/src/infrastructure/repositories/core-api-action-catalog.repository';

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

const entryDto = {
  tool_name: 'delete_chart',
  action_name: 'chart.delete',
  description: 'Deletes a chart.',
  input_schema: { type: 'object', properties: {}, required: [] },
  permission: 'write',
  audit_required: true,
  approval_required: true,
};

describe('CoreApiActionCatalogRepository', () => {
  it('hits GET /chart-actions/mcp-tools for the chart domain', async () => {
    const transport = new FakeGeneratedApiTransport([entryDto]);
    const repository = new CoreApiActionCatalogRepository(transport);

    const result = await repository.list('chart');

    expect(transport.requests[0]).toEqual({
      path: '/chart-actions/mcp-tools',
      init: { method: 'GET' },
    });
    expect(result[0]).toEqual({
      toolName: 'delete_chart',
      actionName: 'chart.delete',
      description: 'Deletes a chart.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      permission: 'write',
      auditRequired: true,
      approvalRequired: true,
    });
  });

  it('hits GET /document-actions/mcp-tools for the document domain', async () => {
    const transport = new FakeGeneratedApiTransport([entryDto]);
    const repository = new CoreApiActionCatalogRepository(transport);

    await repository.list('document');

    expect(transport.requests[0]?.path).toBe('/document-actions/mcp-tools');
  });

  it('defaults an unrecognized permission to read', async () => {
    const transport = new FakeGeneratedApiTransport([{ ...entryDto, permission: 'nonsense' }]);
    const repository = new CoreApiActionCatalogRepository(transport);

    const result = await repository.list('chart');

    expect(result[0]?.permission).toBe('read');
  });
});
