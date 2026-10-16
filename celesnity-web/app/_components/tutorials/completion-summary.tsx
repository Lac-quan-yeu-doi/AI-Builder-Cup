'use client';

import { CheckCircle2Icon } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/_components/ui/alert-dialog';
import { Button } from '@/app/_components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/app/_components/ui/card';
import { InlineError, PageAlert } from '@/app/_components/ui/page-alert';
import { Spinner } from '@/app/_components/ui/spinner';
import { useTranslation } from '@/app/_i18n/use-translation';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import type { RepeatTutorialController } from '@/src/interface-adapters/controllers/tutorials/repeat-tutorial.controller';
import type { RepeatTutorialInput } from '@/src/interface-adapters/controllers/tutorials/tutorial.schemas';
import type { CompletionSummaryViewModel } from '@/src/interface-adapters/presenters/completion.presenter';
import type {
  RepeatTutorialViewModel,
  TutorialProgressViewModel,
} from '@/src/interface-adapters/presenters/tutorial-run.presenter';

export type RepeatedTutorialViewModel = Extract<
  RepeatTutorialViewModel,
  { readonly outcome: 'REPEATED' }
>;

export interface CompletionSummaryProps {
  readonly summary: CompletionSummaryViewModel;
  readonly progress: TutorialProgressViewModel;
  readonly repeatTutorial: RepeatTutorialController;
  readonly onOpenNextTutorial: (tutorialId: string) => void;
  readonly onRepeatStarted: (result: RepeatedTutorialViewModel) => void;
  readonly onReturnToWorkspace?: () => void;
}

type PendingRepeatAction = 'request' | 'confirm' | 'decline' | null;

function copyProgressForController(
  progress: TutorialProgressViewModel,
): RepeatTutorialInput['progress'] {
  return {
    ...progress,
    completedStepIds: [...progress.completedStepIds],
    contextSelections: progress.contextSelections.map((selection) => ({ ...selection })),
  };
}

/**
 * Completion feedback for a successfully persisted tutorial run. Repetition is
 * delegated to the repeat controller so confirmation and progress preservation
 * remain application rules rather than React rules.
 */
export function CompletionSummary({
  summary,
  progress,
  repeatTutorial,
  onOpenNextTutorial,
  onRepeatStarted,
  onReturnToWorkspace,
}: CompletionSummaryProps) {
  const { t } = useTranslation();
  const setOpenSurface = useTutorialSessionStore((state) => state.setOpenSurface);
  const mounted = useRef(true);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [pendingRepeatAction, setPendingRepeatAction] = useState<PendingRepeatAction>(null);
  const [repeatFailed, setRepeatFailed] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const completedAt = new Intl.DateTimeFormat(summary.selectedLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(summary.completedAt));

  const applyRepeatedTutorial = (result: RepeatedTutorialViewModel) => {
    setConfirmationOpen(false);
    setOpenSurface('walkthrough');
    onRepeatStarted(result);
  };

  const requestRepeatConfirmation = async () => {
    setPendingRepeatAction('request');
    setRepeatFailed(false);

    try {
      const result = await repeatTutorial({
        progress: copyProgressForController(progress),
      });
      if (!mounted.current) return;

      if (result.outcome === 'CONFIRMATION_REQUIRED') {
        setConfirmationOpen(true);
      } else if (result.outcome === 'REPEATED') {
        applyRepeatedTutorial(result);
      }
    } catch {
      if (mounted.current) setRepeatFailed(true);
    } finally {
      if (mounted.current) setPendingRepeatAction(null);
    }
  };

  const confirmRepeat = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setPendingRepeatAction('confirm');
    setRepeatFailed(false);

    try {
      const result = await repeatTutorial({
        progress: copyProgressForController(progress),
        confirmed: true,
      });
      if (!mounted.current) return;

      if (result.outcome === 'REPEATED') {
        applyRepeatedTutorial(result);
      } else {
        setConfirmationOpen(false);
      }
    } catch {
      if (mounted.current) setRepeatFailed(true);
    } finally {
      if (mounted.current) setPendingRepeatAction(null);
    }
  };

  const declineRepeat = async (event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    setPendingRepeatAction('decline');

    try {
      await repeatTutorial({
        progress: copyProgressForController(progress),
        confirmed: false,
      });
    } catch {
      // Declining does not persist or replace progress, so completion remains intact.
    } finally {
      if (mounted.current) {
        setPendingRepeatAction(null);
        setConfirmationOpen(false);
      }
    }
  };

  const returnToWorkspace = () => {
    setOpenSurface('none');
    onReturnToWorkspace?.();
  };

  const openNextTutorial = () => {
    if (!summary.nextRecommendation) return;
    setOpenSurface('detail');
    onOpenNextTutorial(summary.nextRecommendation.tutorialId);
  };

  const repeatBusy = pendingRepeatAction !== null;

  return (
    <section
      aria-label={t('tutorial.completionLabel')}
      className="flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden bg-card text-card-foreground"
      data-tutorial-panel="completion"
    >
      <CardHeader className="border-b border-border px-5 py-5 min-[1024px]:px-6">
        <div className="flex items-start gap-3">
          <CheckCircle2Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary" />
          <div className="min-w-0">
            <CardTitle>
              <h2 className="text-heading-3 text-foreground">{t('tutorial.completionTitle')}</h2>
            </CardTitle>
            <CardDescription className="mt-2 text-body-sm">
              {t('tutorial.completionDescription')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <CardContent className="grid gap-6 px-5 py-5 min-[1024px]:px-6">
          {summary.fallbackLocale ? (
            <PageAlert tone="info">
              {t('tutorial.fallbackLocaleNotice', {
                fallbackLocale: summary.fallbackLocale.name,
              })}
            </PageAlert>
          ) : null}

          <div className="grid gap-2">
            <h3 className="text-title text-foreground">{summary.title}</h3>
            <time className="text-caption text-muted-foreground" dateTime={summary.completedAt}>
              {t('tutorial.completedAt', { date: completedAt })}
            </time>
          </div>

          <section aria-labelledby="tutorial-completed-outcomes" className="grid gap-3">
            <h3 id="tutorial-completed-outcomes" className="text-label text-foreground">
              {t('tutorial.completedOutcomes')}
            </h3>
            <ul className="grid list-disc gap-2 pl-5 text-body-sm text-muted-foreground">
              {summary.outcomes.map((outcome, index) => (
                <li key={`${index}-${outcome}`}>{outcome}</li>
              ))}
            </ul>
          </section>

          {summary.nextRecommendation ? (
            <Card className="gap-4 bg-muted py-4 shadow-none">
              <CardHeader className="gap-1 px-4">
                <CardTitle>
                  <h3 className="text-label text-foreground">{t('tutorial.nextTutorialTitle')}</h3>
                </CardTitle>
                <CardDescription className="text-body-sm">
                  {summary.nextRecommendation.title}
                </CardDescription>
              </CardHeader>
              <CardFooter className="px-4">
                <Button onClick={openNextTutorial} variant="secondary">
                  {t('tutorial.viewNextTutorial')}
                </Button>
              </CardFooter>
            </Card>
          ) : null}

          {repeatFailed && !confirmationOpen ? (
            <InlineError>{t('tutorial.progressPersistenceFailure')}</InlineError>
          ) : null}
        </CardContent>
      </div>

      <CardFooter className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4 min-[1024px]:px-6">
        <Button onClick={returnToWorkspace} variant="outline">
          {t('tutorial.returnToWorkspace')}
        </Button>
        <Button
          aria-busy={pendingRepeatAction === 'request'}
          disabled={repeatBusy}
          onClick={() => void requestRepeatConfirmation()}
        >
          {pendingRepeatAction === 'request' ? <Spinner aria-hidden="true" /> : null}
          {t('tutorial.repeat')}
        </Button>
      </CardFooter>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && confirmationOpen && pendingRepeatAction === null) {
            void declineRepeat();
          }
        }}
        open={confirmationOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('tutorial.repeatConfirmationTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('tutorial.repeatConfirmationDescription')}
            </AlertDialogDescription>
            {repeatFailed ? (
              <InlineError>{t('tutorial.progressPersistenceFailure')}</InlineError>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              aria-busy={pendingRepeatAction === 'decline'}
              disabled={repeatBusy}
              onClick={(event) => void declineRepeat(event)}
            >
              {pendingRepeatAction === 'decline' ? <Spinner aria-hidden="true" /> : null}
              {t('tutorial.cancelRepeat')}
            </AlertDialogCancel>
            <AlertDialogAction
              aria-busy={pendingRepeatAction === 'confirm'}
              disabled={repeatBusy}
              onClick={(event) => void confirmRepeat(event)}
            >
              {pendingRepeatAction === 'confirm' ? <Spinner aria-hidden="true" /> : null}
              {t('tutorial.confirmRepeat')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
