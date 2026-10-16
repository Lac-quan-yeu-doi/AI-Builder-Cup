import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import type { CompletionRecord } from '@/src/entities/models/tutorial-progress';

export type TutorialLocale = 'en' | 'vi';

export interface NamedFallbackLocale {
  readonly code: TutorialLocale;
  readonly name: string;
}

export interface LocalizedCompletionContent {
  readonly title?: string;
  readonly outcomes?: readonly string[];
  readonly nextRecommendationTitle?: string;
}

export interface NextTutorialRecommendationViewModel {
  readonly tutorialId: string;
  readonly title: string;
}

export interface CompletionSummaryViewModel {
  readonly title: string;
  readonly outcomes: readonly string[];
  readonly completedAt: string;
  readonly nextRecommendation: NextTutorialRecommendationViewModel | null;
  readonly selectedLocale: TutorialLocale;
  /** Non-null tells the UI to identify this locale before showing fallback content. */
  readonly fallbackLocale: NamedFallbackLocale | null;
}

export interface PresentCompletionSummaryInput {
  readonly definition: TutorialDefinition;
  readonly completion: CompletionRecord;
  /** Eligibility is decided by the application layer; the presenter only maps the result. */
  readonly nextRecommendation: Pick<PublishedCatalogTutorial, 'id' | 'title'> | null;
  readonly locale: TutorialLocale;
  readonly fallbackLocale: NamedFallbackLocale;
  readonly localizedContent?: Readonly<Partial<Record<TutorialLocale, LocalizedCompletionContent>>>;
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

/** Converts a completed tutorial outcome into a localized, immutable summary model. */
export function presentCompletionSummary({
  definition,
  completion,
  nextRecommendation,
  locale,
  fallbackLocale,
  localizedContent,
}: PresentCompletionSummaryInput): CompletionSummaryViewModel {
  const selectedContent = localizedContent?.[locale];
  const fallbackContent = localizedContent?.[fallbackLocale.code];
  const title = resolveLocalizedValue(
    selectedContent?.title,
    fallbackContent?.title,
    definition.metadata.title,
    locale,
    fallbackLocale.code,
  );
  const outcomes = resolveLocalizedValue(
    selectedContent?.outcomes,
    fallbackContent?.outcomes,
    definition.metadata.learningOutcomes,
    locale,
    fallbackLocale.code,
  );
  const recommendationTitle =
    nextRecommendation === null
      ? undefined
      : resolveLocalizedValue(
          selectedContent?.nextRecommendationTitle,
          fallbackContent?.nextRecommendationTitle,
          nextRecommendation.title,
          locale,
          fallbackLocale.code,
        );
  const usedFallback =
    title.usedFallback || outcomes.usedFallback || recommendationTitle?.usedFallback === true;

  return {
    title: title.value,
    outcomes: [...outcomes.value],
    completedAt: completion.completedAt,
    nextRecommendation:
      nextRecommendation === null || recommendationTitle === undefined
        ? null
        : {
            tutorialId: nextRecommendation.id,
            title: recommendationTitle.value,
          },
    selectedLocale: locale,
    fallbackLocale: usedFallback ? { ...fallbackLocale } : null,
  };
}
