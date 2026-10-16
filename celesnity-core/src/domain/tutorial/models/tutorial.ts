import {
  isWorkspaceFeature,
  type WorkspaceFeature,
} from '@application/administration/workspace-feature';

export const TUTORIAL_PROGRESS_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
] as const;

export type TutorialProgressStatus = (typeof TUTORIAL_PROGRESS_STATUSES)[number];
export type TutorialOnboardingDecision = 'ACCEPTED' | 'DISMISSED';

export interface TutorialMetadata {
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly learningOutcomes: readonly string[];
  readonly estimatedMinutes: number;
  readonly stepCount: number;
}

export type TutorialExperience =
  | { readonly mode: 'WORKSPACE' }
  | {
      readonly mode: 'SIMULATED_CHAT';
      readonly scenarioId: string;
      readonly scenarioVersion: 1;
      readonly resumePolicy: 'RESTART';
    };

export interface TutorialStep {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly instructionalContent: string;
  readonly destinationFeature: WorkspaceFeature;
  readonly destinationHref: string;
  readonly requiredAction?: { readonly id: string; readonly accessibleName: string };
  readonly targetControl?: {
    readonly id: string;
    readonly accessibleName: string;
    readonly selector: string;
  };
}

export interface TutorialDefinition {
  readonly id: string;
  /** Older published definitions default to the live Workspace experience. */
  readonly experience?: TutorialExperience;
  readonly metadata: TutorialMetadata;
  readonly steps: readonly TutorialStep[];
  readonly requiredFeatures: readonly WorkspaceFeature[];
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

export type TutorialPublicationViolation =
  | 'MISSING_ID'
  | 'MISSING_METADATA'
  | 'EMPTY_STEPS'
  | 'UNORDERED_STEPS'
  | 'AMBIGUOUS_ACTION'
  | 'AMBIGUOUS_TARGET'
  | 'MISSING_REQUIRED_FEATURES'
  | 'MISSING_PREREQUISITES'
  | 'MISSING_CONTEXT_REQUIREMENTS'
  | 'INVALID_EXPERIENCE'
  | 'METADATA_STEP_COUNT_MISMATCH';

export interface TutorialContextSelection {
  readonly requirementId: string;
  readonly resourceType: string;
  readonly resourceId: string;
}

export interface TutorialProgress {
  readonly tutorialId: string;
  readonly memberId: string;
  readonly organizationId: string;
  readonly status: TutorialProgressStatus;
  readonly currentStepId: string;
  readonly completedStepIds: readonly string[];
  readonly contextSelections: readonly TutorialContextSelection[];
  readonly updatedAt: string;
}

export function tutorialIsAccessible(
  definition: Pick<TutorialDefinition, 'requiredFeatures'>,
  visibleFeatures: readonly WorkspaceFeature[] | null | undefined,
): boolean {
  return (
    visibleFeatures == null ||
    definition.requiredFeatures.every((feature) => visibleFeatures.includes(feature))
  );
}

export function validateTutorialDefinition(
  candidate: TutorialDefinition,
): readonly TutorialPublicationViolation[] {
  const violations: TutorialPublicationViolation[] = [];
  const add = (violation: TutorialPublicationViolation): void => {
    if (!violations.includes(violation)) violations.push(violation);
  };

  if (candidate.id.trim() === '') add('MISSING_ID');
  if (!candidate.metadata || candidate.metadata.title.trim() === '') add('MISSING_METADATA');
  if (candidate.steps.length === 0) add('EMPTY_STEPS');
  if (candidate.steps.some((step, index) => step.order !== index + 1)) add('UNORDERED_STEPS');
  if (!Array.isArray(candidate.requiredFeatures)) add('MISSING_REQUIRED_FEATURES');
  if (!Array.isArray(candidate.prerequisites)) add('MISSING_PREREQUISITES');
  if (!Array.isArray(candidate.contextRequirements)) add('MISSING_CONTEXT_REQUIREMENTS');
  const experience = candidate.experience as unknown;
  if (
    experience !== undefined &&
    (typeof experience !== 'object' ||
      experience === null ||
      !('mode' in experience) ||
      (experience.mode !== 'WORKSPACE' &&
        !(
          experience.mode === 'SIMULATED_CHAT' &&
          'scenarioId' in experience &&
          typeof experience.scenarioId === 'string' &&
          experience.scenarioId.trim().length > 0 &&
          'scenarioVersion' in experience &&
          experience.scenarioVersion === 1 &&
          'resumePolicy' in experience &&
          experience.resumePolicy === 'RESTART'
        )))
  ) {
    add('INVALID_EXPERIENCE');
  }
  if (candidate.metadata.stepCount !== candidate.steps.length) add('METADATA_STEP_COUNT_MISMATCH');
  if (
    candidate.requiredFeatures.some((feature) => !isWorkspaceFeature(feature)) ||
    candidate.steps.some((step) => !isWorkspaceFeature(step.destinationFeature))
  ) {
    add('MISSING_REQUIRED_FEATURES');
  }
  return violations;
}
