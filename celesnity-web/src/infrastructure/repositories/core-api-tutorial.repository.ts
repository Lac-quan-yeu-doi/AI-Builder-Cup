import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import {
  RemoteServiceError,
  TutorialAccessError,
  TutorialPublicationError,
} from '@/src/entities/errors/application-errors';
import type { PublicationViolation as ApplicationPublicationViolation } from '@/src/entities/errors/application-errors';
import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import type {
  PublicationResult,
  PublicationViolation,
  TutorialDefinition,
  TutorialId,
  TutorialMetadata,
  TutorialExperience,
  TutorialStep,
} from '@/src/entities/models/tutorial-definition';
import { isWorkspaceFeature, type WorkspaceFeature } from '@/src/entities/models/workspace-feature';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface TutorialMetadataDto {
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly learningOutcomes: readonly string[];
  readonly estimatedMinutes: number;
  readonly stepCount: number;
}

interface CatalogTutorialDto {
  readonly id: string;
  readonly metadata: TutorialMetadataDto;
}

interface RequiredActionDto {
  readonly id: string;
  readonly accessibleName: string;
}

interface TargetControlDto {
  readonly id: string;
  readonly accessibleName: string;
  readonly selector: string;
}

interface TutorialStepDto {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly instructionalContent: string;
  readonly destinationFeature: string;
  readonly destinationHref: string;
  readonly requiredAction?: RequiredActionDto;
  readonly targetControl?: TargetControlDto;
}

interface TutorialDefinitionDto {
  readonly id: string;
  readonly experience?: {
    readonly mode: string;
    readonly scenarioId?: string;
    readonly scenarioVersion?: number;
    readonly resumePolicy?: string;
  };
  readonly metadata: TutorialMetadataDto;
  readonly steps: readonly TutorialStepDto[];
  readonly requiredFeatures: readonly string[];
  readonly prerequisites: readonly {
    readonly id: string;
    readonly description: string;
    readonly informational?: boolean;
  }[];
  readonly contextRequirements: readonly {
    readonly id: string;
    readonly resourceType: string;
    readonly selectionCount: number;
  }[];
}

type PublicationResultDto =
  { readonly ok: true } | { readonly ok: false; readonly violations: readonly string[] };

export class CoreApiTutorialRepository implements TutorialRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async listAccessibleCatalog(): Promise<readonly PublishedCatalogTutorial[]> {
    const response = await this.request<readonly CatalogTutorialDto[]>(
      '/tutorials',
      {
        method: 'GET',
      },
      [401, 403],
    );

    return mapTutorialResponse(() => response.map(mapCatalogTutorial));
  }

  public async getDefinition(id: TutorialId): Promise<TutorialDefinition> {
    const response = await this.request<TutorialDefinitionDto>(
      tutorialPath(id),
      {
        method: 'GET',
      },
      [401, 403, 404],
    );

    return mapTutorialResponse(() => mapDefinition(response));
  }

  public async publish(candidate: TutorialDefinition): Promise<PublicationResult> {
    let response: PublicationResultDto;

    try {
      response = await this.transport.request<PublicationResultDto>('/tutorials', {
        method: 'POST',
        body: JSON.stringify(mapDefinitionRequest(candidate)),
      });
    } catch (error) {
      const violation = publicationViolationFromError(error);
      if (violation !== undefined) {
        throw new TutorialPublicationError([violation]);
      }
      throw translateCoreApiError(error);
    }

    return mapTutorialResponse(() => mapPublicationResult(response));
  }

  private async request<TResponse>(
    path: string,
    init: RequestInit,
    concealedStatuses: readonly number[],
  ): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      if (error instanceof CoreApiError && concealedStatuses.includes(error.status)) {
        throw new TutorialAccessError();
      }
      throw translateCoreApiError(error);
    }
  }
}

function tutorialPath(id: TutorialId): string {
  return `/tutorials/${encodeURIComponent(id)}`;
}

function mapCatalogTutorial(dto: CatalogTutorialDto): PublishedCatalogTutorial {
  return {
    id: dto.id,
    title: dto.metadata.title,
    summary: dto.metadata.summary,
    category: dto.metadata.category,
    learningOutcomes: [...dto.metadata.learningOutcomes],
    estimatedMinutes: dto.metadata.estimatedMinutes,
    stepCount: dto.metadata.stepCount,
  };
}

function mapMetadata(dto: TutorialMetadataDto): TutorialMetadata {
  return {
    title: dto.title,
    summary: dto.summary,
    category: dto.category,
    learningOutcomes: [...dto.learningOutcomes],
    estimatedMinutes: dto.estimatedMinutes,
    stepCount: dto.stepCount,
  };
}

function mapStep(dto: TutorialStepDto): TutorialStep {
  return {
    id: dto.id,
    order: dto.order,
    title: dto.title,
    instructionalContent: dto.instructionalContent,
    destinationFeature: mapWorkspaceFeature(dto.destinationFeature),
    destinationHref: dto.destinationHref,
    ...(dto.requiredAction
      ? {
          requiredAction: {
            id: dto.requiredAction.id,
            accessibleName: dto.requiredAction.accessibleName,
          },
        }
      : {}),
    ...(dto.targetControl
      ? {
          targetControl: {
            id: dto.targetControl.id,
            accessibleName: dto.targetControl.accessibleName,
            selector: dto.targetControl.selector,
          },
        }
      : {}),
  };
}

function mapDefinition(dto: TutorialDefinitionDto): TutorialDefinition {
  return {
    id: dto.id,
    experience: mapExperience(dto.experience),
    metadata: mapMetadata(dto.metadata),
    steps: dto.steps.map(mapStep),
    requiredFeatures: dto.requiredFeatures.map(mapWorkspaceFeature),
    prerequisites: dto.prerequisites.map((prerequisite) => ({
      id: prerequisite.id,
      description: prerequisite.description,
      ...(prerequisite.informational === true ? { informational: true } : {}),
    })),
    contextRequirements: dto.contextRequirements.map((requirement) => ({
      id: requirement.id,
      resourceType: requirement.resourceType,
      selectionCount: requirement.selectionCount,
    })),
  };
}

function mapDefinitionRequest(definition: TutorialDefinition): TutorialDefinitionDto {
  return {
    id: definition.id,
    experience: definition.experience ?? { mode: 'WORKSPACE' },
    metadata: {
      title: definition.metadata.title,
      summary: definition.metadata.summary,
      category: definition.metadata.category,
      learningOutcomes: [...definition.metadata.learningOutcomes],
      estimatedMinutes: definition.metadata.estimatedMinutes,
      stepCount: definition.metadata.stepCount,
    },
    steps: definition.steps.map((step) => ({
      id: step.id,
      order: step.order,
      title: step.title,
      instructionalContent: step.instructionalContent,
      destinationFeature: step.destinationFeature,
      destinationHref: step.destinationHref,
      ...(step.requiredAction
        ? {
            requiredAction: {
              id: step.requiredAction.id,
              accessibleName: step.requiredAction.accessibleName,
            },
          }
        : {}),
      ...(step.targetControl
        ? {
            targetControl: {
              id: step.targetControl.id,
              accessibleName: step.targetControl.accessibleName,
              selector: step.targetControl.selector,
            },
          }
        : {}),
    })),
    requiredFeatures: [...definition.requiredFeatures],
    prerequisites: definition.prerequisites.map((prerequisite) => ({
      id: prerequisite.id,
      description: prerequisite.description,
      ...(prerequisite.informational === true ? { informational: true } : {}),
    })),
    contextRequirements: definition.contextRequirements.map((requirement) => ({
      id: requirement.id,
      resourceType: requirement.resourceType,
      selectionCount: requirement.selectionCount,
    })),
  };
}

function mapExperience(dto: TutorialDefinitionDto['experience']): TutorialExperience {
  if (dto === undefined || dto.mode === 'WORKSPACE') return { mode: 'WORKSPACE' };
  if (
    dto.mode !== 'SIMULATED_CHAT' ||
    typeof dto.scenarioId !== 'string' ||
    dto.scenarioVersion !== 1 ||
    dto.resumePolicy !== 'RESTART'
  ) {
    throw new Error('The Core API returned an invalid tutorial experience.');
  }
  return {
    mode: 'SIMULATED_CHAT',
    scenarioId: dto.scenarioId,
    scenarioVersion: 1,
    resumePolicy: 'RESTART',
  };
}

function mapPublicationResult(dto: PublicationResultDto): PublicationResult {
  if (dto.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    violations: dto.violations.map(mapPublicationViolation),
  };
}

function mapWorkspaceFeature(value: string): WorkspaceFeature {
  if (!isWorkspaceFeature(value)) {
    throw new Error('The Core API returned an invalid tutorial workspace feature.');
  }
  return value;
}

function mapPublicationViolation(value: string): PublicationViolation {
  switch (value) {
    case 'MISSING_ID':
    case 'MISSING_METADATA':
    case 'EMPTY_STEPS':
    case 'UNORDERED_STEPS':
    case 'AMBIGUOUS_ACTION':
    case 'AMBIGUOUS_TARGET':
    case 'MISSING_REQUIRED_FEATURES':
    case 'MISSING_PREREQUISITES':
    case 'MISSING_CONTEXT_REQUIREMENTS':
    case 'INVALID_EXPERIENCE':
    case 'METADATA_STEP_COUNT_MISMATCH':
      return value;
    default:
      throw new Error('The Core API returned an invalid tutorial publication violation.');
  }
}

function publicationViolationFromError(
  error: unknown,
): ApplicationPublicationViolation | undefined {
  if (
    !(error instanceof CoreApiError) ||
    (error.status !== 400 && error.status !== 422) ||
    error.code === undefined
  ) {
    return undefined;
  }

  switch (error.code) {
    case 'MISSING_ID':
    case 'MISSING_METADATA':
    case 'EMPTY_STEPS':
    case 'AMBIGUOUS_ACTION':
    case 'AMBIGUOUS_TARGET':
    case 'INVALID_EXPERIENCE':
    case 'METADATA_STEP_COUNT_MISMATCH':
      return error.code;
    default:
      return undefined;
  }
}

function mapTutorialResponse<TResult>(map: () => TResult): TResult {
  try {
    return map();
  } catch (error) {
    throw new RemoteServiceError('The Core API returned an invalid tutorial response.', {
      cause: error,
      exposeMessage: false,
    });
  }
}
