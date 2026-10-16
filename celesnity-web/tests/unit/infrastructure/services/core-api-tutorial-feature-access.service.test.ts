import { describe, expect, it } from 'vitest';

import {
  FeatureAccessDeniedError,
  RemoteServiceError,
} from '@/src/entities/errors/application-errors';
import { workspaceFeatures } from '@/src/entities/models/workspace-feature';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiTutorialFeatureAccessService } from '@/src/infrastructure/services/core-api-tutorial-feature-access.service';

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
    throw new Error('stream is not used by tutorial feature access');
  }
}

describe('CoreApiTutorialFeatureAccessService', () => {
  it('loads only the current server-authorized feature policy fields', async () => {
    const transport = new FakeTransport([
      {
        visibleFeatures: ['HOME', 'QUERY'],
        accessToken: 'feature-policy-sensitive-value',
        inaccessibleFeatureDetails: { id: 'ADMINISTRATION', name: 'Administration' },
      },
    ]);
    const service = new CoreApiTutorialFeatureAccessService(transport);

    const result = await service.accessibleFeatures();

    expect(result).toEqual(['HOME', 'QUERY']);
    expect(JSON.stringify(result)).not.toContain('feature-policy-sensitive-value');
    expect(JSON.stringify(result)).not.toContain('ADMINISTRATION');
    expect(transport.requests).toEqual([{ path: '/administration/me', init: { method: 'GET' } }]);
  });

  it('maps an unrestricted policy to every workspace feature using a fresh array', async () => {
    const transport = new FakeTransport([{ visibleFeatures: null }, { visibleFeatures: null }]);
    const service = new CoreApiTutorialFeatureAccessService(transport);

    const first = await service.accessibleFeatures();
    const second = await service.accessibleFeatures();

    expect(first).toEqual(workspaceFeatures);
    expect(first).not.toBe(workspaceFeatures);
    expect(second).not.toBe(first);
  });

  it('fails closed for invalid policies and translates Core API authorization failures', async () => {
    const invalidService = new CoreApiTutorialFeatureAccessService(
      new FakeTransport([{ visibleFeatures: ['HOME', 'UNKNOWN_FEATURE'] }]),
    );
    const deniedService = new CoreApiTutorialFeatureAccessService(
      new FakeTransport([new CoreApiError(403, 'Feature access denied.', 'FEATURE_ACCESS_DENIED')]),
    );

    await expect(invalidService.accessibleFeatures()).rejects.toMatchObject({
      name: 'RemoteServiceError',
      exposeMessage: false,
    } satisfies Partial<RemoteServiceError>);
    await expect(deniedService.accessibleFeatures()).rejects.toBeInstanceOf(
      FeatureAccessDeniedError,
    );
  });
});
