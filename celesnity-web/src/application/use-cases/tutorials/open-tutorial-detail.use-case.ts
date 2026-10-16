import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type {
  ContextResource,
  WorkspaceContextService,
} from '@/src/application/services/workspace-context.service.interface';
import type { TutorialFeatureAccessService } from '@/src/application/services/tutorial-feature-access.service.interface';
import type {
  PrerequisiteDescriptor,
  TutorialExperience,
  TutorialId,
  TutorialMetadata,
} from '@/src/entities/models/tutorial-definition';
import {
  evaluateEligibility,
  type EligibilityResult,
} from '@/src/entities/models/tutorial-eligibility';
import type { ContextSelection, ProgressRecord } from '@/src/entities/models/tutorial-progress';

export interface RemediationAction {
  readonly label: string;
  readonly href: string;
}

export type PrerequisiteEvaluation =
  | {
      readonly id: string;
      readonly satisfied: true;
    }
  | {
      readonly id: string;
      readonly satisfied: false;
      readonly remediation: RemediationAction;
    };

export interface OpenTutorialDetailInput {
  readonly tutorialId: TutorialId;
  readonly prerequisiteEvaluations: readonly PrerequisiteEvaluation[];
  readonly contextSelections: readonly ContextSelection[];
}

export interface TutorialPrerequisiteState {
  readonly id: string;
  readonly description: string;
  readonly informational?: boolean;
  readonly satisfied: boolean;
  readonly remediation: RemediationAction | null;
}

export interface ValidatedContextSelection extends ContextSelection {
  readonly resourceName: string;
}

export interface TutorialContextSelector {
  readonly id: string;
  readonly requirementId: string;
  readonly resourceType: string;
  readonly options: readonly ContextResource[];
  readonly selectedResource: ContextResource | null;
}

export interface OpenTutorialDetailResult {
  readonly tutorialId: TutorialId;
  readonly experience: TutorialExperience;
  readonly metadata: TutorialMetadata;
  readonly prerequisiteStates: readonly TutorialPrerequisiteState[];
  readonly contextSelectors: readonly TutorialContextSelector[];
  readonly contextSelections: readonly ValidatedContextSelection[];
  readonly replacementRequiredRequirementIds: readonly string[];
  readonly eligibility: EligibilityResult;
  readonly startEnabled: boolean;
  readonly progress?: ProgressRecord;
}

export type OpenTutorialDetailUseCase = ReturnType<typeof createOpenTutorialDetailUseCase>;

function buildPrerequisiteStates(
  prerequisites: readonly PrerequisiteDescriptor[],
  evaluations: readonly PrerequisiteEvaluation[],
): readonly TutorialPrerequisiteState[] {
  const evaluationsById = new Map(evaluations.map((evaluation) => [evaluation.id, evaluation]));

  return prerequisites.map((prerequisite) => {
    if (prerequisite.informational === true) {
      return {
        id: prerequisite.id,
        description: prerequisite.description,
        informational: true,
        satisfied: true,
        remediation: null,
      };
    }

    const evaluation = evaluationsById.get(prerequisite.id);
    if (evaluation === undefined) {
      throw new RangeError(`Missing evaluation for prerequisite "${prerequisite.id}".`);
    }

    return {
      id: prerequisite.id,
      description: prerequisite.description,
      satisfied: evaluation.satisfied,
      remediation: evaluation.satisfied ? null : { ...evaluation.remediation },
    };
  });
}

function authorizedResourcesByType(
  resourceTypes: readonly string[],
  workspaceContextService: WorkspaceContextService,
): Promise<ReadonlyMap<string, readonly ContextResource[]>> {
  const distinctResourceTypes = [...new Set(resourceTypes)];

  return Promise.all(
    distinctResourceTypes.map(async (resourceType) => {
      const resources = await workspaceContextService.listAuthorizedResources(resourceType);
      return [
        resourceType,
        resources.filter((resource) => resource.resourceType === resourceType),
      ] as const;
    }),
  ).then((entries) => new Map(entries));
}

export const createOpenTutorialDetailUseCase =
  (
    tutorialRepository: TutorialRepository,
    featureAccessService: TutorialFeatureAccessService,
    workspaceContextService: WorkspaceContextService,
    progressRepository?: Pick<TutorialProgressRepository, 'listForMember'>,
  ) =>
  async (input: OpenTutorialDetailInput): Promise<OpenTutorialDetailResult> => {
    const [definition, progressRecords] = await Promise.all([
      tutorialRepository.getDefinition(input.tutorialId),
      progressRepository?.listForMember() ?? Promise.resolve([]),
    ]);
    const progress = progressRecords.find((record) => record.tutorialId === input.tutorialId);
    const requestedSelections =
      input.contextSelections.length > 0
        ? input.contextSelections
        : (progress?.contextSelections ?? input.contextSelections);
    const prerequisiteStates = buildPrerequisiteStates(
      definition.prerequisites,
      input.prerequisiteEvaluations,
    );
    const [accessibleFeatures, resourcesByType] = await Promise.all([
      featureAccessService.accessibleFeatures(),
      authorizedResourcesByType(
        definition.contextRequirements.map((requirement) => requirement.resourceType),
        workspaceContextService,
      ),
    ]);
    const requirementsById = new Map(
      definition.contextRequirements.map((requirement) => [requirement.id, requirement]),
    );
    const invalidRequirementIds = new Set<string>();

    const validatedSelections = await Promise.all(
      requestedSelections.map(async (selection): Promise<ValidatedContextSelection | null> => {
        const requirement = requirementsById.get(selection.requirementId);
        if (requirement === undefined) {
          return null;
        }
        if (selection.resourceType !== requirement.resourceType) {
          invalidRequirementIds.add(requirement.id);
          return null;
        }

        const authorizedResource = resourcesByType
          .get(requirement.resourceType)
          ?.find((resource) => resource.id === selection.resourceId);
        const isStillValid =
          authorizedResource !== undefined &&
          (await workspaceContextService.isResourceStillValid(
            requirement.resourceType,
            selection.resourceId,
          ));

        if (!isStillValid || authorizedResource === undefined) {
          invalidRequirementIds.add(requirement.id);
          return null;
        }

        return {
          ...selection,
          resourceName: authorizedResource.name,
        };
      }),
    );
    const contextSelections = validatedSelections.filter(
      (selection): selection is ValidatedContextSelection => selection !== null,
    );
    const selectionsByRequirement = new Map<string, ValidatedContextSelection[]>();

    contextSelections.forEach((selection) => {
      const selections = selectionsByRequirement.get(selection.requirementId) ?? [];
      selections.push(selection);
      selectionsByRequirement.set(selection.requirementId, selections);
    });

    const contextSelectors = definition.contextRequirements.flatMap((requirement) => {
      const options = resourcesByType.get(requirement.resourceType) ?? [];
      const selected = selectionsByRequirement.get(requirement.id) ?? [];

      return Array.from({ length: requirement.selectionCount }, (_, index) => {
        const selectedSelection = selected[index];
        const selectedResource =
          selectedSelection === undefined
            ? null
            : (options.find((option) => option.id === selectedSelection.resourceId) ?? null);

        return {
          id: `${requirement.id}:${index + 1}`,
          requirementId: requirement.id,
          resourceType: requirement.resourceType,
          options,
          selectedResource,
        };
      });
    });
    const replacementRequiredRequirementIds = definition.contextRequirements
      .filter((requirement) => invalidRequirementIds.has(requirement.id))
      .map((requirement) => requirement.id);
    const eligibility = evaluateEligibility({
      requiredFeatures: definition.requiredFeatures,
      accessibleFeatures,
      prerequisiteStates,
      contextRequirements: definition.contextRequirements,
      contextSelections,
    });
    const lifecycleActionAvailable =
      progress === undefined ||
      progress.status === 'NOT_STARTED' ||
      progress.status === 'PAUSED' ||
      progress.status === 'IN_PROGRESS' ||
      progress.status === 'COMPLETED';

    return {
      tutorialId: definition.id,
      experience: definition.experience ?? { mode: 'WORKSPACE' },
      metadata: definition.metadata,
      prerequisiteStates,
      contextSelectors,
      contextSelections,
      replacementRequiredRequirementIds,
      eligibility,
      startEnabled: eligibility.eligible && lifecycleActionAvailable,
      ...(progress === undefined
        ? {}
        : {
            progress: {
              ...progress,
              completedStepIds: [...progress.completedStepIds],
              contextSelections: progress.contextSelections.map((selection) => ({ ...selection })),
            },
          }),
    };
  };
