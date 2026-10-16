import type { TutorialFeatureAccessService } from '@/src/application/services/tutorial-feature-access.service.interface';
import {
  isWorkspaceFeature,
  workspaceFeatures,
  type WorkspaceFeature,
} from '@/src/entities/models/workspace-feature';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface WorkspaceAccessDto {
  readonly visibleFeatures: readonly WorkspaceFeature[] | null;
}

export class CoreApiTutorialFeatureAccessService implements TutorialFeatureAccessService {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async accessibleFeatures(): Promise<readonly WorkspaceFeature[]> {
    const response = await this.request<unknown>('/administration/me', { method: 'GET' });
    return decodeAccessibleFeatures(response);
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function decodeAccessibleFeatures(value: unknown): readonly WorkspaceFeature[] {
  try {
    if (!isWorkspaceAccessDto(value)) {
      throw new Error('The Core API returned an invalid workspace access policy.');
    }

    if (value.visibleFeatures === null) return [...workspaceFeatures];
    return [...value.visibleFeatures];
  } catch (error) {
    throw translateCoreApiError(error);
  }
}

function isWorkspaceAccessDto(value: unknown): value is WorkspaceAccessDto {
  if (!isRecord(value) || !('visibleFeatures' in value)) return false;
  return (
    value.visibleFeatures === null ||
    (Array.isArray(value.visibleFeatures) &&
      value.visibleFeatures.every(
        (feature): feature is WorkspaceFeature =>
          typeof feature === 'string' && isWorkspaceFeature(feature),
      ))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
