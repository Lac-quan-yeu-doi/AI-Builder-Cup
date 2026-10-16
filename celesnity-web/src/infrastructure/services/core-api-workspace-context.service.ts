import type {
  ContextResource,
  WorkspaceContextService,
} from '@/src/application/services/workspace-context.service.interface';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface ContextResourceDto {
  readonly id: string;
  readonly name: string;
  readonly resourceType: string;
}

export class CoreApiWorkspaceContextService implements WorkspaceContextService {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async listAuthorizedResources(resourceType: string): Promise<readonly ContextResource[]> {
    const response = await this.request<unknown>(contextResourcesPath(resourceType), {
      method: 'GET',
    });
    return decodeAuthorizedResources(response, resourceType);
  }

  public async isResourceStillValid(resourceType: string, resourceId: string): Promise<boolean> {
    const resources = await this.listAuthorizedResources(resourceType);
    return resources.some((resource) => resource.id === resourceId);
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function contextResourcesPath(resourceType: string): string {
  const query = new URLSearchParams({ resourceType });
  return `/tutorials/context-resources?${query.toString()}`;
}

function decodeAuthorizedResources(
  value: unknown,
  resourceType: string,
): readonly ContextResource[] {
  try {
    if (!isRecord(value) || !Array.isArray(value.items)) {
      throw new Error('The Core API returned an invalid tutorial context resource list.');
    }

    const items = value.items as readonly unknown[];
    if (!items.every(isContextResourceDto)) {
      throw new Error('The Core API returned an invalid tutorial context resource.');
    }

    return items
      .filter((item) => item.resourceType === resourceType)
      .map((item) => ({ id: item.id, name: item.name, resourceType: item.resourceType }));
  } catch (error) {
    throw translateCoreApiError(error);
  }
}

function isContextResourceDto(value: unknown): value is ContextResourceDto {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.resourceType === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
