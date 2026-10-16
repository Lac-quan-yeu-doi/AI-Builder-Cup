import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import { RemoteServiceError } from '@/src/entities/errors/application-errors';
import type { OnboardingDecision } from '@/src/entities/models/onboarding';
import type {
  CompletionRecord,
  ContextSelection,
  ProgressRecord,
  TutorialStatus,
} from '@/src/entities/models/tutorial-progress';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface ContextSelectionDto {
  readonly requirementId: string;
  readonly resourceType: string;
  readonly resourceId: string;
}

interface ProgressRecordResponseDto {
  readonly tutorialId: string;
  readonly memberId: string;
  readonly organizationId: string;
  readonly status: string;
  readonly currentStepId: string;
  readonly completedStepIds: readonly string[];
  readonly contextSelections: readonly ContextSelectionDto[];
  readonly updatedAt: string;
}

interface SaveProgressRequestDto {
  readonly status: TutorialStatus;
  readonly currentStepId: string;
  readonly completedStepIds: readonly string[];
  readonly contextSelections: readonly ContextSelectionDto[];
  readonly updatedAt: string;
}

type OnboardingDecisionDto = 'ACCEPTED' | 'DISMISSED';

interface OnboardingDecisionResponseDto {
  readonly decision: OnboardingDecisionDto;
}

interface CompletionRecordResponseDto {
  readonly runId: string;
  readonly completedAt: string;
}

const PROGRESS_PATH = '/tutorial-progress';
const ONBOARDING_DECISION_PATH = '/tutorial-onboarding-decision';

/**
 * Persists tutorial state for the authenticated member and current organization.
 * Identity fields are response-only so callers cannot select another persistence scope.
 */
export class CoreApiTutorialProgressRepository implements TutorialProgressRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async listForMember(): Promise<readonly ProgressRecord[]> {
    const response = await this.request<readonly ProgressRecordResponseDto[]>(PROGRESS_PATH, {
      method: 'GET',
    });
    return response.map(mapProgressRecord);
  }

  public async save(record: ProgressRecord): Promise<ProgressRecord> {
    const response = await this.request<ProgressRecordResponseDto>(
      progressPath(record.tutorialId),
      {
        method: 'PUT',
        body: JSON.stringify(mapSaveProgressRequest(record)),
      },
    );
    return mapProgressRecord(response);
  }

  public async getOnboardingDecision(): Promise<OnboardingDecision | null> {
    const response = await this.request<OnboardingDecisionResponseDto | null | undefined>(
      ONBOARDING_DECISION_PATH,
      { method: 'GET' },
    );
    return response === null || response === undefined
      ? null
      : mapOnboardingDecision(response.decision);
  }

  public async saveOnboardingDecision(decision: OnboardingDecision): Promise<OnboardingDecision> {
    const response = await this.request<OnboardingDecisionResponseDto>(ONBOARDING_DECISION_PATH, {
      method: 'PUT',
      body: JSON.stringify({ decision: mapOnboardingDecisionRequest(decision) }),
    });
    return mapOnboardingDecision(response.decision);
  }

  public async saveCompletion(runId: string): Promise<CompletionRecord> {
    const response = await this.request<CompletionRecordResponseDto>(completionPath(runId), {
      method: 'PUT',
    });
    return mapCompletionRecord(response);
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function progressPath(tutorialId: string): string {
  return `${PROGRESS_PATH}/${encodeURIComponent(tutorialId)}`;
}

function completionPath(runId: string): string {
  return `/tutorial-runs/${encodeURIComponent(runId)}/completion`;
}

function mapProgressRecord(dto: ProgressRecordResponseDto): ProgressRecord {
  return {
    tutorialId: dto.tutorialId,
    memberId: dto.memberId,
    organizationId: dto.organizationId,
    status: mapTutorialStatus(dto.status),
    currentStepId: dto.currentStepId,
    completedStepIds: [...dto.completedStepIds],
    contextSelections: dto.contextSelections.map(mapContextSelection),
    updatedAt: dto.updatedAt,
  };
}

function mapSaveProgressRequest(record: ProgressRecord): SaveProgressRequestDto {
  return {
    status: record.status,
    currentStepId: record.currentStepId,
    completedStepIds: [...record.completedStepIds],
    contextSelections: record.contextSelections.map(mapContextSelectionRequest),
    updatedAt: record.updatedAt,
  };
}

function mapContextSelection(dto: ContextSelectionDto): ContextSelection {
  return {
    requirementId: dto.requirementId,
    resourceType: dto.resourceType,
    resourceId: dto.resourceId,
  };
}

function mapContextSelectionRequest(selection: ContextSelection): ContextSelectionDto {
  return {
    requirementId: selection.requirementId,
    resourceType: selection.resourceType,
    resourceId: selection.resourceId,
  };
}

function mapTutorialStatus(status: string): TutorialStatus {
  if (
    status === 'NOT_STARTED' ||
    status === 'IN_PROGRESS' ||
    status === 'PAUSED' ||
    status === 'COMPLETED'
  ) {
    return status;
  }
  throw invalidResponseError('tutorial progress status');
}

function mapOnboardingDecision(decision: OnboardingDecisionDto): OnboardingDecision {
  if (decision === 'ACCEPTED') {
    return 'accepted';
  }
  if (decision === 'DISMISSED') {
    return 'dismissed';
  }
  throw invalidResponseError('onboarding decision');
}

function mapOnboardingDecisionRequest(decision: OnboardingDecision): OnboardingDecisionDto {
  return decision === 'accepted' ? 'ACCEPTED' : 'DISMISSED';
}

function mapCompletionRecord(dto: CompletionRecordResponseDto): CompletionRecord {
  return {
    runId: dto.runId,
    completedAt: dto.completedAt,
  };
}

function invalidResponseError(field: string): RemoteServiceError {
  return new RemoteServiceError(`The Core API returned an invalid ${field}.`, {
    exposeMessage: false,
  });
}
