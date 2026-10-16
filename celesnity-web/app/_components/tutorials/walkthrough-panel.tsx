'use client';

import { XIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { useTutorialSurfaceFocus } from '@/app/_components/tutorials/use-tutorial-surface-focus';

import { Button } from '@/app/_components/ui/button';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { ScrollArea } from '@/app/_components/ui/scroll-area';
import { Spinner } from '@/app/_components/ui/spinner';
import type { TranslationKey } from '@/app/_i18n/en';
import { useTranslation } from '@/app/_i18n/use-translation';
import type {
  InstructionalContentPartViewModel,
  StepViewModel,
} from '@/src/interface-adapters/presenters/walkthrough.presenter';

export type WalkthroughFailureReason =
  'destination-readiness' | 'destination-transition' | 'target-not-found';

export type WalkthroughPanelState =
  | { readonly kind: 'ready' }
  | { readonly kind: 'preparing' }
  | { readonly kind: 'transitioning' }
  | { readonly kind: 'failure'; readonly reason: WalkthroughFailureReason };

export type WalkthroughPendingAction = 'previous' | 'forward' | 'pause' | 'retry';

export interface WalkthroughPanelProps {
  readonly step: StepViewModel;
  /**
   * Transient browser state supplied by the host from destination readiness,
   * target-control, and controller outcomes. Domain navigation rules remain in
   * the StepViewModel.
   */
  readonly state?: WalkthroughPanelState;
  readonly pendingAction?: WalkthroughPendingAction | null;
  /** Live target supplied by the spotlight coordinator for keyboard focus transfer. */
  readonly targetControl?: HTMLElement | null;
  readonly onPrevious: () => void;
  readonly onForward: () => void;
  /** Pause and close deliberately share this request so both use one controller path. */
  readonly onPause: () => void;
  readonly onRetry: () => void;
}

const READY_STATE: WalkthroughPanelState = Object.freeze({ kind: 'ready' });

const FAILURE_MESSAGE_KEYS: Readonly<Record<WalkthroughFailureReason, TranslationKey>> = {
  'destination-readiness': 'tutorial.destinationFailure',
  'destination-transition': 'tutorial.transitionFailure',
  'target-not-found': 'tutorial.targetFailure',
};

interface ContentPartProps {
  readonly part: InstructionalContentPartViewModel;
}

function ContentPart({ part }: ContentPartProps) {
  const { t } = useTranslation();

  switch (part.kind) {
    case 'text':
      return <span>{part.text}</span>;
    case 'emphasis':
      return <strong className="font-semibold text-foreground">{part.text}</strong>;
    case 'action-callout':
      return (
        <aside
          aria-label={t('tutorial.actionRequired')}
          className="my-4 rounded-lg border border-border bg-muted p-4 text-foreground"
          role="note"
        >
          <p className="text-label text-muted-foreground">{t('tutorial.actionRequired')}</p>
          <p className="mt-2 text-body-md whitespace-pre-wrap">{part.text}</p>
        </aside>
      );
  }
}

interface PauseButtonProps {
  readonly pendingAction: WalkthroughPendingAction | null;
  readonly onPause: () => void;
  readonly variant: 'outline' | 'secondary';
}

function PauseButton({ pendingAction, onPause, variant }: PauseButtonProps) {
  const { t } = useTranslation();
  const isPausing = pendingAction === 'pause';

  return (
    <Button
      aria-busy={isPausing}
      disabled={pendingAction !== null}
      onClick={onPause}
      variant={variant}
    >
      {isPausing ? <Spinner aria-hidden="true" /> : null}
      {isPausing ? t('tutorial.pausing') : t('tutorial.pause')}
    </Button>
  );
}

/**
 * Presentational walkthrough surface. The shell owns controller calls and
 * translates destination/target hooks into the transient state consumed here.
 */
export function WalkthroughPanel({
  step,
  state = READY_STATE,
  pendingAction = null,
  targetControl = null,
  onPrevious,
  onForward,
  onPause,
  onRetry,
}: WalkthroughPanelProps) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useTutorialSurfaceFocus(headingRef);
  useEffect(() => {
    if (!targetControl) return;

    const returnToWalkthrough = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        event.preventDefault();
        headingRef.current?.focus();
      }
    };
    targetControl.addEventListener('keydown', returnToWalkthrough);
    return () => targetControl.removeEventListener('keydown', returnToWalkthrough);
  }, [targetControl]);

  const navigationBlocked = state.kind !== 'ready' || pendingAction !== null;
  const isFailure = state.kind === 'failure';
  const isPreparing = state.kind === 'preparing' || state.kind === 'transitioning';
  const isRetrying = pendingAction === 'retry';
  const forwardLabel = step.forwardLabel === 'Finish' ? t('tutorial.finish') : t('tutorial.next');

  return (
    <section
      aria-label={t('tutorial.walkthroughLabel')}
      className="flex h-dvh min-h-0 w-full max-w-full min-w-0 flex-col overflow-x-hidden bg-card text-card-foreground min-[1024px]:ml-auto min-[1024px]:h-full min-[1024px]:w-[24rem]"
      data-tutorial-panel="walkthrough"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 min-[1024px]:px-6">
        <div className="min-w-0">
          <p className="text-label text-muted-foreground">{step.tutorialTitle}</p>
          <p className="mt-2 text-caption text-muted-foreground">
            {t('tutorial.stepPosition', {
              step: step.stepNumber,
              total: step.totalSteps,
            })}
          </p>
          <h2 ref={headingRef} className="mt-1 text-title text-foreground" tabIndex={-1}>
            {step.stepTitle}
          </h2>
        </div>
        <Button
          aria-busy={pendingAction === 'pause'}
          aria-label={t('tutorial.closeWalkthrough')}
          disabled={pendingAction !== null}
          onClick={onPause}
          size="icon-sm"
          variant="ghost"
        >
          <XIcon aria-hidden="true" />
        </Button>
      </header>

      <div aria-live="polite" className="sr-only">
        <p>
          {t('tutorial.stepAnnouncement', {
            title: step.stepTitle,
            step: step.stepNumber,
            total: step.totalSteps,
          })}
        </p>
        {step.targetAccessibleName ? (
          <p>{t('tutorial.targetAnnouncement', { name: step.targetAccessibleName })}</p>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-5 py-5 min-[1024px]:px-6">
          {step.fallbackLocale ? (
            <PageAlert tone="info">
              {t('tutorial.fallbackLocaleNotice', {
                fallbackLocale: step.fallbackLocale.name,
              })}
            </PageAlert>
          ) : null}

          <div className="text-body-md whitespace-pre-wrap text-foreground">
            {step.content.map((part, index) => (
              <ContentPart key={`${part.kind}-${index}`} part={part} />
            ))}
          </div>

          {step.targetAccessibleName ? (
            <section
              aria-label={t('tutorial.targetControl')}
              className="rounded-lg border border-border bg-background p-4"
            >
              <p className="text-label text-muted-foreground">{t('tutorial.targetControl')}</p>
              <p className="mt-2 text-body-md font-semibold text-foreground">
                {step.targetAccessibleName}
              </p>
              {targetControl ? (
                <Button className="mt-3" onClick={() => targetControl.focus()} variant="outline">
                  {t('tutorial.goToTarget')}
                </Button>
              ) : null}
            </section>
          ) : null}

          {isPreparing ? (
            <div aria-live="polite" className="flex items-center gap-2 text-body-sm" role="status">
              <Spinner aria-hidden="true" />
              <span>{t('tutorial.destinationPreparing')}</span>
            </div>
          ) : null}

          {isFailure ? (
            <PageAlert className="grid gap-4" tone="error">
              <p>{t(FAILURE_MESSAGE_KEYS[state.reason])}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  aria-busy={isRetrying}
                  disabled={pendingAction !== null}
                  onClick={onRetry}
                  variant="secondary"
                >
                  {isRetrying ? <Spinner aria-hidden="true" /> : null}
                  {t('tutorial.retry')}
                </Button>
                <PauseButton onPause={onPause} pendingAction={pendingAction} variant="outline" />
              </div>
            </PageAlert>
          ) : null}
        </div>
      </ScrollArea>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 min-[1024px]:px-6">
        {isFailure ? (
          <span aria-hidden="true" />
        ) : (
          <PauseButton onPause={onPause} pendingAction={pendingAction} variant="outline" />
        )}
        <div className="ml-auto flex gap-2">
          <Button
            aria-busy={pendingAction === 'previous'}
            disabled={navigationBlocked || !step.previousEnabled}
            onClick={onPrevious}
            variant="outline"
          >
            {pendingAction === 'previous' ? <Spinner aria-hidden="true" /> : null}
            {t('tutorial.previous')}
          </Button>
          <Button
            aria-busy={pendingAction === 'forward'}
            disabled={navigationBlocked || !step.forwardEnabled}
            onClick={onForward}
          >
            {pendingAction === 'forward' ? <Spinner aria-hidden="true" /> : null}
            {forwardLabel}
          </Button>
        </div>
      </footer>
    </section>
  );
}
