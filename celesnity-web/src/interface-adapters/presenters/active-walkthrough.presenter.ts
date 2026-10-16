import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import type {
  TutorialDefinition,
  TutorialExperience,
  TutorialStep,
} from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import {
  presentCompletionSummary,
  type CompletionSummaryViewModel,
} from '@/src/interface-adapters/presenters/completion.presenter';
import {
  presentTutorialProgress,
  type TutorialProgressViewModel,
} from '@/src/interface-adapters/presenters/tutorial-run.presenter';
import {
  presentWalkthroughStep,
  type StepViewModel,
  type TutorialLocale,
} from '@/src/interface-adapters/presenters/walkthrough.presenter';
import { getVietnameseAgentTutorial } from '@/src/entities/models/tutorial-agent-localizations';

export interface ActiveWalkthroughPresentationInput {
  readonly runId: string;
  readonly progress: ProgressRecord;
  readonly definition: TutorialDefinition;
  readonly nextRecommendation: Pick<PublishedCatalogTutorial, 'id' | 'title'> | null;
  readonly locale: TutorialLocale;
}

export interface WalkthroughStepViewModel {
  readonly step: StepViewModel;
  readonly destinationHref: string;
  readonly targetSelector: string | null;
  readonly requiredActionId: string | null;
}

export interface ActiveWalkthroughViewModel {
  readonly runId: string;
  readonly tutorialId: string;
  readonly experience: TutorialExperience;
  readonly progress: TutorialProgressViewModel;
  readonly stepViews: ReadonlyMap<string, WalkthroughStepViewModel>;
  readonly steps: readonly TutorialStep[];
  readonly completionSummary: CompletionSummaryViewModel;
}

const FALLBACK_LOCALE = Object.freeze({ code: 'en' as const, name: 'English' });

export function presentActiveWalkthrough(
  opened: ActiveWalkthroughPresentationInput,
): ActiveWalkthroughViewModel {
  const progress = presentTutorialProgress(opened.progress);
  const vietnamese =
    opened.locale === 'vi' ? getVietnameseAgentTutorial(opened.definition.id) : null;
  const stepViews = new Map(
    opened.definition.steps.map((step) => {
      const localizedStep = vietnamese?.steps[step.id];
      return [
        step.id,
        Object.freeze({
          step: presentWalkthroughStep({
            definition: opened.definition,
            step,
            progress: opened.progress,
            locale: opened.locale,
            fallbackLocale: FALLBACK_LOCALE,
            ...(localizedStep === undefined || vietnamese === null
              ? {}
              : {
                  localizedContent: {
                    vi: {
                      tutorialTitle: vietnamese.metadata.title,
                      stepTitle: localizedStep.title,
                      content: [{ kind: 'text' as const, text: localizedStep.content }],
                      ...(localizedStep.targetAccessibleName === undefined
                        ? {}
                        : {
                            targetAccessibleName: localizedStep.targetAccessibleName,
                          }),
                    },
                  },
                }),
          }),
          destinationHref: step.destinationHref,
          targetSelector: step.targetControl?.selector ?? null,
          requiredActionId: step.requiredAction?.id ?? null,
        }),
      ] as const;
    }),
  );
  return Object.freeze({
    runId: opened.runId,
    tutorialId: opened.definition.id,
    experience: Object.freeze(opened.definition.experience ?? { mode: 'WORKSPACE' }),
    progress,
    stepViews,
    steps: Object.freeze(
      opened.definition.steps.map((step) => ({
        ...step,
        ...(step.requiredAction ? { requiredAction: { ...step.requiredAction } } : {}),
        ...(step.targetControl ? { targetControl: { ...step.targetControl } } : {}),
      })),
    ),
    completionSummary: Object.freeze(
      presentCompletionSummary({
        definition: opened.definition,
        completion: { runId: opened.runId, completedAt: opened.progress.updatedAt },
        nextRecommendation: opened.nextRecommendation,
        locale: opened.locale,
        fallbackLocale: FALLBACK_LOCALE,
        ...(vietnamese === null
          ? {}
          : {
              localizedContent: {
                vi: {
                  title: vietnamese.completionTitle,
                  outcomes: vietnamese.completionOutcomes,
                },
              },
            }),
      }),
    ),
  });
}
