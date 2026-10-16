import type { WorkspaceFeature } from './workspace-feature';

/** Stable identifier retained by every revision of a tutorial definition. */
export type TutorialId = string;

export type TutorialExperience =
  | { readonly mode: 'WORKSPACE' }
  | {
      readonly mode: 'SIMULATED_CHAT';
      readonly scenarioId: string;
      readonly scenarioVersion: 1;
      readonly resumePolicy: 'RESTART';
    };

export interface TutorialMetadata {
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly learningOutcomes: readonly string[];
  readonly estimatedMinutes: number;
  readonly stepCount: number;
}

export interface ContextRequirement {
  readonly id: string;
  readonly resourceType: string;
  readonly selectionCount: number;
}

export interface PrerequisiteDescriptor {
  readonly id: string;
  readonly description: string;
  /** Displays preparation guidance that cannot be verified by the Workspace. */
  readonly informational?: boolean;
}

export interface RequiredActionDescriptor {
  readonly id: string;
  readonly accessibleName: string;
}

export interface TargetControlDescriptor {
  readonly id: string;
  readonly accessibleName: string;
  readonly selector: string;
}

export interface TutorialStep {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly instructionalContent: string;
  readonly destinationFeature: WorkspaceFeature;
  readonly destinationHref: string;
  readonly requiredAction?: RequiredActionDescriptor;
  readonly targetControl?: TargetControlDescriptor;
}

export interface TutorialDefinition {
  /** Readonly so a revision cannot replace the definition's stable identity. */
  readonly id: TutorialId;
  /** Definitions published before simulated tutorials default to WORKSPACE. */
  readonly experience?: TutorialExperience;
  readonly metadata: TutorialMetadata;
  readonly steps: readonly TutorialStep[];
  readonly requiredFeatures: readonly WorkspaceFeature[];
  readonly prerequisites: readonly PrerequisiteDescriptor[];
  readonly contextRequirements: readonly ContextRequirement[];
}

export type PublicationViolation =
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

export type PublicationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly violations: readonly PublicationViolation[] };

const PUBLICATION_SUCCESS: PublicationResult = Object.freeze({ ok: true });

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the rules a tutorial definition must satisfy before publication.
 *
 * The entity shape enforces one metadata record, singular action/target fields,
 * explicit requirement collections, and stable identity at compile time. These
 * runtime checks also reject malformed boundary data that bypasses TypeScript.
 */
export function validatePublication(candidate: TutorialDefinition): PublicationResult {
  const value = candidate as unknown as Readonly<Record<string, unknown>>;
  const violations: PublicationViolation[] = [];
  const addViolation = (violation: PublicationViolation): void => {
    if (!violations.includes(violation)) {
      violations.push(violation);
    }
  };

  if (typeof value.id !== 'string' || value.id.trim().length === 0) {
    addViolation('MISSING_ID');
  }

  const metadata = value.metadata;
  const hasSingleMetadata = isRecord(metadata);
  if (!hasSingleMetadata) {
    addViolation('MISSING_METADATA');
  }

  const stepsValue = value.steps;
  const steps = Array.isArray(stepsValue) ? stepsValue : [];
  if (steps.length === 0) {
    addViolation('EMPTY_STEPS');
  } else {
    steps.forEach((step, index) => {
      if (!isRecord(step) || step.order !== index + 1) {
        addViolation('UNORDERED_STEPS');
      }
      if (isRecord(step) && Array.isArray(step.requiredAction)) {
        addViolation('AMBIGUOUS_ACTION');
      }
      if (isRecord(step) && Array.isArray(step.targetControl)) {
        addViolation('AMBIGUOUS_TARGET');
      }
    });
  }

  if (!Array.isArray(value.requiredFeatures)) {
    addViolation('MISSING_REQUIRED_FEATURES');
  }
  if (!Array.isArray(value.prerequisites)) {
    addViolation('MISSING_PREREQUISITES');
  }
  if (!Array.isArray(value.contextRequirements)) {
    addViolation('MISSING_CONTEXT_REQUIREMENTS');
  }

  const experience = value.experience;
  if (
    experience !== undefined &&
    (!isRecord(experience) ||
      (experience.mode !== 'WORKSPACE' &&
        !(
          experience.mode === 'SIMULATED_CHAT' &&
          typeof experience.scenarioId === 'string' &&
          experience.scenarioId.trim().length > 0 &&
          experience.scenarioVersion === 1 &&
          experience.resumePolicy === 'RESTART'
        )))
  ) {
    addViolation('INVALID_EXPERIENCE');
  }

  if (
    hasSingleMetadata &&
    (!Number.isInteger(metadata.stepCount) || metadata.stepCount !== steps.length)
  ) {
    addViolation('METADATA_STEP_COUNT_MISMATCH');
  }

  if (violations.length === 0) {
    return PUBLICATION_SUCCESS;
  }

  return Object.freeze({
    ok: false,
    violations: Object.freeze(violations),
  });
}
