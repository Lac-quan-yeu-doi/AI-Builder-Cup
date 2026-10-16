import type { TutorialDefinition, TutorialStep } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import {
  canAdvanceNext,
  isFinalStep,
  isFirstStep,
  type ForwardAvailabilityState,
} from '@/src/entities/models/tutorial-run';

export type TutorialLocale = 'en' | 'vi';

export interface NamedFallbackLocale {
  readonly code: TutorialLocale;
  readonly name: string;
}

export type InstructionalContentPartViewModel =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'emphasis'; readonly text: string }
  | { readonly kind: 'action-callout'; readonly text: string };

/**
 * Optional published translations for one walkthrough step. Missing fields are
 * resolved independently so partially translated content still reports use of
 * the named fallback locale.
 */
export interface LocalizedWalkthroughContent {
  readonly tutorialTitle?: string;
  readonly stepTitle?: string;
  readonly content?: readonly InstructionalContentPartViewModel[];
  readonly targetAccessibleName?: string;
}

export interface StepViewModel {
  readonly tutorialTitle: string;
  readonly stepTitle: string;
  readonly stepNumber: number;
  readonly totalSteps: number;
  readonly content: readonly InstructionalContentPartViewModel[];
  readonly targetAccessibleName?: string;
  readonly previousEnabled: boolean;
  readonly forwardLabel: 'Next' | 'Finish';
  readonly forwardEnabled: boolean;
  readonly selectedLocale: TutorialLocale;
  /** Non-null tells the UI to identify this locale before showing fallback content. */
  readonly fallbackLocale: NamedFallbackLocale | null;
}

export interface PresentWalkthroughStepInput {
  readonly definition: TutorialDefinition;
  readonly step: TutorialStep;
  readonly progress: ProgressRecord;
  readonly availability?: ForwardAvailabilityState;
  readonly locale: TutorialLocale;
  readonly fallbackLocale: NamedFallbackLocale;
  readonly localizedContent?: Readonly<
    Partial<Record<TutorialLocale, LocalizedWalkthroughContent>>
  >;
}

interface ResolvedValue<Value> {
  readonly value: Value;
  readonly usedFallback: boolean;
}

function resolveLocalizedValue<Value>(
  selectedValue: Value | undefined,
  fallbackValue: Value | undefined,
  sourceValue: Value,
  selectedLocale: TutorialLocale,
  fallbackLocale: TutorialLocale,
): ResolvedValue<Value> {
  if (selectedValue !== undefined) {
    return { value: selectedValue, usedFallback: false };
  }

  return {
    value: fallbackValue ?? sourceValue,
    usedFallback: selectedLocale !== fallbackLocale,
  };
}

function copyContent(
  content: readonly InstructionalContentPartViewModel[],
): readonly InstructionalContentPartViewModel[] {
  return content.map((part) => ({ ...part }));
}

/** Converts an active tutorial step into a localized, immutable walkthrough model. */
export function presentWalkthroughStep({
  definition,
  step,
  progress,
  availability,
  locale,
  fallbackLocale,
  localizedContent,
}: PresentWalkthroughStepInput): StepViewModel {
  const stepIndex = definition.steps.findIndex((candidate) => candidate.id === step.id);
  if (stepIndex < 0) {
    throw new RangeError('The active tutorial step must belong to the tutorial definition.');
  }

  const selectedContent = localizedContent?.[locale];
  const fallbackContent = localizedContent?.[fallbackLocale.code];
  const tutorialTitle = resolveLocalizedValue(
    selectedContent?.tutorialTitle,
    fallbackContent?.tutorialTitle,
    definition.metadata.title,
    locale,
    fallbackLocale.code,
  );
  const stepTitle = resolveLocalizedValue(
    selectedContent?.stepTitle,
    fallbackContent?.stepTitle,
    step.title,
    locale,
    fallbackLocale.code,
  );
  const content = resolveLocalizedValue(
    selectedContent?.content,
    fallbackContent?.content,
    [{ kind: 'text', text: step.instructionalContent }] as const,
    locale,
    fallbackLocale.code,
  );
  const targetAccessibleName =
    step.targetControl === undefined
      ? undefined
      : resolveLocalizedValue(
          selectedContent?.targetAccessibleName,
          fallbackContent?.targetAccessibleName,
          step.targetControl.accessibleName,
          locale,
          fallbackLocale.code,
        );
  const usedFallback =
    tutorialTitle.usedFallback ||
    stepTitle.usedFallback ||
    content.usedFallback ||
    targetAccessibleName?.usedFallback === true;

  return {
    tutorialTitle: tutorialTitle.value,
    stepTitle: stepTitle.value,
    stepNumber: stepIndex + 1,
    totalSteps: definition.steps.length,
    content: copyContent(content.value),
    ...(targetAccessibleName === undefined
      ? {}
      : { targetAccessibleName: targetAccessibleName.value }),
    previousEnabled: !isFirstStep(step, definition.steps),
    forwardLabel: isFinalStep(step, definition.steps) ? 'Finish' : 'Next',
    forwardEnabled: canAdvanceNext(step, progress, availability),
    selectedLocale: locale,
    fallbackLocale: usedFallback ? { ...fallbackLocale } : null,
  };
}
