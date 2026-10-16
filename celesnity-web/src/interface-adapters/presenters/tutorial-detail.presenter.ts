import type {
  TutorialExperience,
  TutorialId,
  TutorialMetadata,
} from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';

export interface TutorialRemediationPresentationInput {
  readonly label: string;
  readonly href: string;
}

export interface TutorialPrerequisitePresentationInput {
  readonly id: string;
  readonly description: string;
  readonly informational?: boolean;
  readonly satisfied: boolean;
  readonly remediation: TutorialRemediationPresentationInput | null;
}

export interface TutorialContextResourcePresentationInput {
  readonly id: string;
  readonly name: string;
  readonly resourceType: string;
}

export interface TutorialContextSelectorPresentationInput {
  readonly id: string;
  readonly requirementId: string;
  readonly resourceType: string;
  readonly options: readonly TutorialContextResourcePresentationInput[];
  readonly selectedResource: TutorialContextResourcePresentationInput | null;
}

export interface TutorialDetailPresentationInput {
  readonly tutorialId: TutorialId;
  readonly experience: TutorialExperience;
  readonly metadata: TutorialMetadata;
  readonly prerequisiteStates: readonly TutorialPrerequisitePresentationInput[];
  readonly contextSelectors: readonly TutorialContextSelectorPresentationInput[];
  readonly startEnabled: boolean;
  readonly progress?: ProgressRecord;
}

export interface TutorialMetadataViewModel {
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly learningOutcomes: readonly string[];
  readonly estimatedMinutes: number;
  readonly stepCount: number;
}

export interface TutorialRemediationViewModel {
  readonly label: string;
  readonly href: string;
}

export interface TutorialPrerequisiteStateViewModel {
  readonly id: string;
  readonly description: string;
  readonly informational?: boolean;
  readonly satisfied: boolean;
  readonly remediation: TutorialRemediationViewModel | null;
}

export interface TutorialContextOptionViewModel {
  readonly id: string;
  readonly name: string;
}

export interface TutorialContextSelectorViewModel {
  readonly id: string;
  readonly requirementId: string;
  readonly resourceType: string;
  readonly options: readonly TutorialContextOptionViewModel[];
  readonly selectedResourceId: string | null;
  readonly selectedResourceName: string | null;
}

export interface DetailViewModel {
  readonly tutorialId: TutorialId;
  readonly experience: TutorialExperience;
  readonly metadata: TutorialMetadataViewModel;
  readonly prerequisiteStates: readonly TutorialPrerequisiteStateViewModel[];
  readonly contextSelectors: readonly TutorialContextSelectorViewModel[];
  readonly startEnabled: boolean;
  readonly progress?: ProgressRecord;
}

function presentMetadata(metadata: TutorialMetadata): TutorialMetadataViewModel {
  return Object.freeze({
    title: metadata.title,
    summary: metadata.summary,
    category: metadata.category,
    learningOutcomes: Object.freeze(metadata.learningOutcomes.map((outcome) => outcome)),
    estimatedMinutes: metadata.estimatedMinutes,
    stepCount: metadata.stepCount,
  });
}

function presentPrerequisite(
  prerequisite: TutorialPrerequisitePresentationInput,
): TutorialPrerequisiteStateViewModel {
  return Object.freeze({
    id: prerequisite.id,
    description: prerequisite.description,
    ...(prerequisite.informational === true ? { informational: true } : {}),
    satisfied: prerequisite.satisfied,
    remediation:
      prerequisite.remediation === null
        ? null
        : Object.freeze({
            label: prerequisite.remediation.label,
            href: prerequisite.remediation.href,
          }),
  });
}

function presentContextOption(
  option: TutorialContextResourcePresentationInput,
): TutorialContextOptionViewModel {
  return Object.freeze({
    id: option.id,
    name: option.name,
  });
}

function presentContextSelector(
  selector: TutorialContextSelectorPresentationInput,
): TutorialContextSelectorViewModel {
  return Object.freeze({
    id: selector.id,
    requirementId: selector.requirementId,
    resourceType: selector.resourceType,
    options: Object.freeze(selector.options.map(presentContextOption)),
    selectedResourceId: selector.selectedResource?.id ?? null,
    selectedResourceName: selector.selectedResource?.name ?? null,
  });
}

/** Maps access-filtered detail data by allowlisting only member-facing fields. */
export function presentTutorialDetail(input: TutorialDetailPresentationInput): DetailViewModel {
  return Object.freeze({
    tutorialId: input.tutorialId,
    experience: Object.freeze({ ...input.experience }),
    metadata: presentMetadata(input.metadata),
    prerequisiteStates: Object.freeze(input.prerequisiteStates.map(presentPrerequisite)),
    contextSelectors: Object.freeze(input.contextSelectors.map(presentContextSelector)),
    startEnabled: input.startEnabled,
    ...(input.progress === undefined
      ? {}
      : {
          progress: Object.freeze({
            ...input.progress,
            completedStepIds: Object.freeze([...input.progress.completedStepIds]),
            contextSelections: Object.freeze(
              input.progress.contextSelections.map((selection) => Object.freeze({ ...selection })),
            ),
          }),
        }),
  });
}
