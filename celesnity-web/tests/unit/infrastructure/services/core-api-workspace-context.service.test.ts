import { describe, expect, it } from 'vitest';

import {
  FeatureAccessDeniedError,
  RemoteServiceError,
} from '@/src/entities/errors/application-errors';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiWorkspaceContextService } from '@/src/infrastructure/services/core-api-workspace-context.service';

class FakeTransport implements GeneratedApiTransport {
  public readonly requests: { readonly path: string; readonly init?: RequestInit }[] = [];

  public constructor(private readonly outcomes: readonly unknown[]) {}

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    const outcome = this.outcomes[this.requests.length - 1];
    if (outcome instanceof Error) throw outcome;
    return outcome as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream is not used by workspace context');
  }
}

describe('CoreApiWorkspaceContextService', () => {
  it('lists only authorized resources of the requested type and revalidates against that list', async () => {
    const response = {
      items: [
        { id: 'database-1', name: 'Orders', resourceType: 'DATABASE', password: 'secret' },
        { id: 'pipeline-1', name: 'Daily load', resourceType: 'PIPELINE' },
      ],
      inaccessibleItems: [
        { id: 'restricted-database', name: 'Restricted', resourceType: 'DATABASE' },
      ],
    };
    const transport = new FakeTransport([response, response, { items: [] }]);
    const service = new CoreApiWorkspaceContextService(transport);

    const resources = await service.listAuthorizedResources('DATABASE');

    expect(resources).toEqual([{ id: 'database-1', name: 'Orders', resourceType: 'DATABASE' }]);
    expect(JSON.stringify(resources)).not.toContain('secret');
    expect(JSON.stringify(resources)).not.toContain('restricted-database');
    await expect(service.isResourceStillValid('DATABASE', 'database-1')).resolves.toBe(true);
    await expect(service.isResourceStillValid('DATABASE', 'database-1')).resolves.toBe(false);

    expect(transport.requests).toEqual([
      { path: '/tutorials/context-resources?resourceType=DATABASE', init: { method: 'GET' } },
      { path: '/tutorials/context-resources?resourceType=DATABASE', init: { method: 'GET' } },
      { path: '/tutorials/context-resources?resourceType=DATABASE', init: { method: 'GET' } },
    ]);
  });

  it('encodes the requested resource type', async () => {
    const transport = new FakeTransport([{ items: [] }]);
    const service = new CoreApiWorkspaceContextService(transport);

    await service.listAuthorizedResources('DATABASE/VIEW');

    expect(transport.requests[0]?.path).toBe(
      '/tutorials/context-resources?resourceType=DATABASE%2FVIEW',
    );
  });

  it('translates authorization and malformed-response failures at the infrastructure boundary', async () => {
    const deniedService = new CoreApiWorkspaceContextService(
      new FakeTransport([new CoreApiError(403, 'Context access denied.', 'FEATURE_ACCESS_DENIED')]),
    );
    const malformedService = new CoreApiWorkspaceContextService(
      new FakeTransport([{ items: [{ id: 'database-1', resourceType: 'DATABASE' }] }]),
    );

    await expect(deniedService.listAuthorizedResources('DATABASE')).rejects.toBeInstanceOf(
      FeatureAccessDeniedError,
    );
    await expect(malformedService.listAuthorizedResources('DATABASE')).rejects.toMatchObject({
      name: 'RemoteServiceError',
      exposeMessage: false,
    } satisfies Partial<RemoteServiceError>);
  });
});
