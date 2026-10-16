import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import type { TutorialFeatureAccessService } from '@/src/application/services/tutorial-feature-access.service.interface';
import type {
  ContextResource,
  WorkspaceContextService,
} from '@/src/application/services/workspace-context.service.interface';
import {
  FeatureAccessDeniedError,
  NotFoundError,
  TutorialAccessError,
} from '@/src/entities/errors/application-errors';
import type {
  ContextRequirement,
  TutorialDefinition,
  TutorialStep,
} from '@/src/entities/models/tutorial-definition';
import { evaluateEligibility } from '@/src/entities/models/tutorial-eligibility';
import {
  resumePoint,
  type ContextSelection,
  type ProgressRecord,
} from '@/src/entities/models/tutorial-progress';
import type { WorkspaceFeature } from '@/src/entities/models/workspace-feature';

export interface ResumePrerequisiteEvaluation {
  readonly id: string;
  readonly satisfied: boolean;
}

export interface ResumeTutorialRunInput {
  readonly progress: ProgressRecord;
  readonly prerequisiteEvaluations: readonly ResumePrerequisiteEvaluation[];
  readonly replacementContextSelections: readonly ContextSelection[];
  readonly destinationReady: boolean;
  readonly resumedAt: string;
  readonly conflictResolution?: 'PAUSE_ACTIVE' | 'CANCEL_NEW_START';
}

export interface ResumeTutorialRunBlockers {
  readonly blockingFeatureIds: readonly WorkspaceFeature[];
  readonly unsatisfiedPrerequisiteIds: readonly string[];
  readonly replacementRequiredRequirementIds: readonly string[];
  readonly destinationNotReady: boolean;
}

export type ResumeTutorialRunResult =
  | {
      readonly outcome: 'RESUMED';
      readonly progress: ProgressRecord;
      readonly destinationHref: string;
    }
  | {
      readonly outcome: 'BLOCKED';
      /** The unchanged persisted run retained while resume is unavailable. */
      readonly progress: ProgressRecord;
      readonly destinationHref: string;
      readonly blockers: ResumeTutorialRunBlockers;
    }
  | {
      readonly outcome: 'CONFLICT_REQUIRES_CHOICE';
      readonly activeRun: ProgressRecord;
      readonly choices: readonly ['PAUSE_ACTIVE', 'CANCEL_NEW_START'];
    }
  | { readonly outcome: 'CANCELLED'; readonly activeRun: ProgressRecord }
  | {
      readonly outcome: 'PAUSE_FAILED';
      readonly activeRun: ProgressRecord;
      readonly reason: unknown;
    };

export interface ResumeTutorialRunDependencies {
  readonly tutorialRepository: Pick<TutorialRepository, 'getDefinition' | 'listAccessibleCatalog'>;
  readonly progressRepository: Pick<TutorialProgressRepository, 'listForMember' | 'save'>;
  readonly featureAccessService: TutorialFeatureAccessService;
  readonly workspaceContextService: WorkspaceContextService;
}

export type ResumeTutorialRunUseCase = ReturnType<typeof createResumeTutorialRunUseCase>;

async function loadAccessibleDefinition(
  tutorialRepository: ResumeTutorialRunDependencies['tutorialRepository'],
  tutorialId: string,
): Promise<TutorialDefinition> {
  const accessibleCatalog = await tutorialRepository.listAccessibleCatalog();
  if (!accessibleCatalog.some((tutorial) => tutorial.id === tutorialId)) {
    throw new TutorialAccessError();
  }

  try {
    const definition = await tutorialRepository.getDefinition(tutorialId);
    if (definition.id !== tutorialId) {
      throw new TutorialAccessError();
    }
    return definition;
  } catch (error) {
    if (
      error instanceof TutorialAccessError ||
      error instanceof FeatureAccessDeniedError ||
      error instanceof NotFoundError
    ) {
      throw new TutorialAccessError();
    }
    throw error;
  }
}

async function authorizedResourcesByType(
  requirements: readonly ContextRequirement[],
  workspaceContextService: WorkspaceContextService,
): Promise<ReadonlyMap<string, readonly ContextResource[]>> {
  const resourceTypes = [...new Set(requirements.map((requirement) => requirement.resourceType))];
  const entries = await Promise.all(
    resourceTypes.map(async (resourceType) => {
      const resources = await workspaceContextService.listAuthorizedResources(resourceType);
      return [
        resourceType,
        resources.filter((resource) => resource.resourceType === resourceType),
      ] as const;
    }),
  );

  return new Map(entries);
}

async function validateContextSelections(
  selections: readonly ContextSelection[],
  requirements: readonly ContextRequirement[],
  resourcesByType: ReadonlyMap<string, readonly ContextResource[]>,
  workspaceContextService: WorkspaceContextService,
): Promise<readonly ContextSelection[]> {
  const requirementsById = new Map(
    requirements.map((requirement) => [requirement.id, requirement]),
  );
  const validated = await Promise.all(
    selections.map(async (selection): Promise<ContextSelection | null> => {
      const requirement = requirementsById.get(selection.requirementId);
      if (requirement === undefined || selection.resourceType !== requirement.resourceType) {
        return null;
      }

      const isAuthorized = resourcesByType
        .get(requirement.resourceType)
        ?.some((resource) => resource.id === selection.resourceId);
      if (isAuthorized !== true) {
        return null;
      }

      const isStillValid = await workspaceContextService.isResourceStillValid(
        requirement.resourceType,
        selection.resourceId,
      );
      return isStillValid ? { ...selection } : null;
    }),
  );

  return validated.filter((selection): selection is ContextSelection => selection !== null);
}

function fillContextRequirements(
  requirements: readonly ContextRequirement[],
  validSavedSelections: readonly ContextSelection[],
  validReplacementSelections: readonly ContextSelection[],
): readonly ContextSelection[] {
  return requirements.flatMap((requirement) => {
    const selected: ContextSelection[] = [];
    const selectedResourceIds = new Set<string>();
    const candidates = [...validSavedSelections, ...validReplacementSelections];

    for (const selection of candidates) {
      if (
        selection.requirementId !== requirement.id ||
        selection.resourceType !== requirement.resourceType ||
        selectedResourceIds.has(selection.resourceId) ||
        selected.length >= requirement.selectionCount
      ) {
        continue;
      }

      selected.push({ ...selection });
      selectedResourceIds.add(selection.resourceId);
    }

    return selected;
  });
}

function prerequisiteStates(
  definition: TutorialDefinition,
  evaluations: readonly ResumePrerequisiteEvaluation[],
): readonly ResumePrerequisiteEvaluation[] {
  const evaluationsById = new Map(
    evaluations.map((evaluation) => [evaluation.id, evaluation.satisfied]),
  );

  return definition.prerequisites.map((prerequisite) => ({
    id: prerequisite.id,
    satisfied:
      prerequisite.informational === true || (evaluationsById.get(prerequisite.id) ?? false),
  }));
}

function firstIncompleteStep(
  progress: ProgressRecord,
  steps: readonly TutorialStep[],
): TutorialStep {
  return resumePoint(progress, steps);
}

/**
 * Revalidates every resume condition without mutating paused progress. The run
 * becomes IN_PROGRESS only after access, prerequisites, context, and destination
 * readiness all succeed; inaccessible tutorials fail with a detail-free error.
 */
export const createResumeTutorialRunUseCase =
  (dependencies: ResumeTutorialRunDependencies) =>
  async (input: ResumeTutorialRunInput): Promise<ResumeTutorialRunResult> => {
    if (input.progress.status !== 'PAUSED' && input.progress.status !== 'IN_PROGRESS') {
      throw new Error('Only a paused or in-progress tutorial run can be resumed.');
    }

    const definition = await loadAccessibleDefinition(
      dependencies.tutorialRepository,
      input.progress.tutorialId,
    );
    const progressRecords = await dependencies.progressRepository.listForMember();
    const conflictingRun = progressRecords.find(
      (record) =>
        record.status === 'IN_PROGRESS' && record.tutorialId !== input.progress.tutorialId,
    );

    if (conflictingRun !== undefined) {
      if (input.conflictResolution === undefined) {
        return {
          outcome: 'CONFLICT_REQUIRES_CHOICE',
          activeRun: conflictingRun,
          choices: ['PAUSE_ACTIVE', 'CANCEL_NEW_START'],
        };
      }

      if (input.conflictResolution === 'CANCEL_NEW_START') {
        return { outcome: 'CANCELLED', activeRun: conflictingRun };
      }

      try {
        await dependencies.progressRepository.save({
          ...conflictingRun,
          status: 'PAUSED',
          updatedAt: input.resumedAt,
        });
      } catch (reason) {
        return { outcome: 'PAUSE_FAILED', activeRun: conflictingRun, reason };
      }
    }

    const resumeStep = firstIncompleteStep(input.progress, definition.steps);
    const [accessibleFeatures, resourcesByType] = await Promise.all([
      dependencies.featureAccessService.accessibleFeatures(),
      authorizedResourcesByType(
        definition.contextRequirements,
        dependencies.workspaceContextService,
      ),
    ]);
    const [validSavedSelections, validReplacementSelections] = await Promise.all([
      validateContextSelections(
        input.progress.contextSelections,
        definition.contextRequirements,
        resourcesByType,
        dependencies.workspaceContextService,
      ),
      validateContextSelections(
        input.replacementContextSelections,
        definition.contextRequirements,
        resourcesByType,
        dependencies.workspaceContextService,
      ),
    ]);
    const contextSelections = fillContextRequirements(
      definition.contextRequirements,
      validSavedSelections,
      validReplacementSelections,
    );
    const eligibility = evaluateEligibility({
      requiredFeatures: definition.requiredFeatures,
      accessibleFeatures,
      prerequisiteStates: prerequisiteStates(definition, input.prerequisiteEvaluations),
      contextRequirements: definition.contextRequirements,
      contextSelections,
    });

    if (!eligibility.eligible || !input.destinationReady) {
      return {
        outcome: 'BLOCKED',
        progress: input.progress,
        destinationHref: resumeStep.destinationHref,
        blockers: {
          blockingFeatureIds: eligibility.blockingFeatureIds,
          unsatisfiedPrerequisiteIds: eligibility.unsatisfiedPrerequisiteIds,
          replacementRequiredRequirementIds: eligibility.unfilledContextRequirementIds,
          destinationNotReady: !input.destinationReady,
        },
      };
    }

    const resumedProgress = await dependencies.progressRepository.save({
      ...input.progress,
      status: 'IN_PROGRESS',
      currentStepId: resumeStep.id,
      contextSelections,
      updatedAt: input.resumedAt,
    });

    return {
      outcome: 'RESUMED',
      progress: resumedProgress,
      destinationHref: resumeStep.destinationHref,
    };
  };
