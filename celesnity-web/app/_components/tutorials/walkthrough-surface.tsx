'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CompletionSummary,
  type RepeatedTutorialViewModel,
} from '@/app/_components/tutorials/completion-summary';
import { SpotlightOverlay } from '@/app/_components/tutorials/spotlight-overlay';
import { rememberTutorialDestination } from '@/app/_components/tutorials/tutorial-destination-memory';
import { useDestinationReady } from '@/app/_components/tutorials/use-destination-ready';
import type { TargetControlStatus } from '@/app/_components/tutorials/use-target-control';
import {
  WalkthroughPanel,
  type WalkthroughFailureReason,
  type WalkthroughPanelState,
  type WalkthroughPendingAction,
} from '@/app/_components/tutorials/walkthrough-panel';
import {
  isWorkspaceRequiredActionId,
  subscribeToWorkspaceRequiredAction,
} from '@/app/_components/shared/workspace-required-actions';
import { Button } from '@/app/_components/ui/button';
import { PageAlert } from '@/app/_components/ui/page-alert';
import type { TranslationKey } from '@/app/_i18n/en';
import { useTranslation } from '@/app/_i18n/use-translation';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import { markStepComplete } from '@/src/entities/models/tutorial-progress';
import type { AdvanceTutorialStepController } from '@/src/interface-adapters/controllers/tutorials/advance-tutorial-step.controller';
import type { CompleteTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/complete-tutorial-run.controller';
import type { PauseTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/pause-tutorial-run.controller';
import type { OpenTutorialWalkthroughController } from '@/src/interface-adapters/controllers/tutorials/open-tutorial-walkthrough.controller';
import type { RepeatTutorialController } from '@/src/interface-adapters/controllers/tutorials/repeat-tutorial.controller';
import type { PauseTutorialRunInput } from '@/src/interface-adapters/controllers/tutorials/tutorial.schemas';
import type {
  AdvanceTutorialStepViewModel,
  TutorialProgressViewModel,
} from '@/src/interface-adapters/presenters/tutorial-run.presenter';
import type {
  ActiveWalkthroughViewModel,
  WalkthroughStepViewModel,
} from '@/src/interface-adapters/presenters/active-walkthrough.presenter';

/**
 * The published read model for one step of an active run.
 *
 * Every field here is produced by the application layer: the walkthrough
 * presenter owns `step`, and the tutorial definition owns the destination,
 * target selector, and Required Action descriptor. React only reads them.
 */
export type ActiveWalkthrough = ActiveWalkthroughViewModel;
export type WalkthroughStepView = WalkthroughStepViewModel;

export interface WalkthroughSurfaceControllers {
  readonly openWalkthrough?: OpenTutorialWalkthroughController;
  readonly advanceStep: AdvanceTutorialStepController;
  readonly pauseRun: PauseTutorialRunController;
  readonly completeRun: CompleteTutorialRunController;
  readonly repeatTutorial: RepeatTutorialController;
}

export interface WalkthroughSurfaceProps {
  readonly controllers: WalkthroughSurfaceControllers;
  /** `null` while no published active-run read model is available. */
  readonly walkthrough: ActiveWalkthrough | null;
  readonly onClose: () => void;
  readonly onOpenTutorialDetail: (tutorialId: string) => void;
  readonly onRepeatStarted?: (destinationHref: string) => void;
}

type AdvanceFailureReason = Extract<AdvanceTutorialStepViewModel, { ok: false }>['reason'];

const DOM_FAILURE_REASONS: Readonly<
  Partial<Record<AdvanceFailureReason, WalkthroughFailureReason>>
> = Object.freeze({
  DESTINATION_NOT_READY: 'destination-readiness',
  TARGET_NOT_LOCATED: 'target-not-found',
});

const NOTICE_KEYS: Readonly<Partial<Record<AdvanceFailureReason, TranslationKey>>> = Object.freeze({
  ACTION_NOT_REQUIRED: 'tutorial.actionFailure',
  REQUIRED_ACTION_FAILED: 'tutorial.actionFailure',
  REQUIRED_ACTION_INCOMPLETE: 'tutorial.actionFailure',
});

const READY_PANEL_STATE: WalkthroughPanelState = Object.freeze({ kind: 'ready' });

function copyProgress(progress: TutorialProgressViewModel): PauseTutorialRunInput['progress'] {
  return {
    ...progress,
    completedStepIds: [...progress.completedStepIds],
    contextSelections: progress.contextSelections.map((selection) => ({ ...selection })),
  };
}

/**
 * Walkthrough and completion surface for one active run.
 *
 * Previous, Next, and Finish go through the advance controller; Finish on the
 * final step goes through the completion controller; Pause and close share the
 * pause controller. Browser facts (destination readiness, whether the target was
 * located) are reported to those controllers as inputs — the decision to move
 * stays in the use cases.
 */
export function WalkthroughSurface({
  controllers,
  walkthrough,
  onClose,
  onOpenTutorialDetail,
  onRepeatStarted,
}: WalkthroughSurfaceProps) {
  const { locale, t } = useTranslation();
  const setActiveRunId = useTutorialSessionStore((state) => state.setActiveRunId);
  const setActiveTutorial = useTutorialSessionStore((state) => state.setActiveTutorial);
  const mounted = useRef(true);
  const retryTargetRef = useRef<(() => void) | null>(null);
  const [progress, setProgress] = useState<TutorialProgressViewModel | null>(
    walkthrough?.progress ?? null,
  );
  const [activeWalkthrough, setActiveWalkthrough] = useState(walkthrough);
  const [completionSummary, setCompletionSummary] = useState(
    walkthrough?.completionSummary ?? null,
  );
  const [completed, setCompleted] = useState(false);
  const [pendingAction, setPendingAction] = useState<WalkthroughPendingAction | null>(null);
  const [domFailure, setDomFailure] = useState<WalkthroughFailureReason | null>(null);
  const [noticeKey, setNoticeKey] = useState<TranslationKey | null>(null);
  const [targetStatus, setTargetStatus] = useState<TargetControlStatus>('idle');
  const [targetControl, setTargetControl] = useState<HTMLElement | null>(null);

  const runId = activeWalkthrough?.runId ?? null;
  const currentProgress = progress ?? activeWalkthrough?.progress ?? null;
  const stepView =
    activeWalkthrough === null || currentProgress === null
      ? undefined
      : activeWalkthrough.stepViews.get(currentProgress.currentStepId);
  const destinationReady = useDestinationReady({
    destinationHref: stepView?.destinationHref ?? null,
    enabled: stepView !== undefined && !completed,
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (runId === null) return;
    setActiveRunId(runId);
    return () => setActiveRunId(null);
  }, [runId, setActiveRunId]);

  useEffect(() => {
    if (completed || activeWalkthrough === null || currentProgress === null) {
      setActiveTutorial(null);
      return;
    }
    setActiveTutorial({
      tutorialId: activeWalkthrough.tutorialId,
      stepId: currentProgress.currentStepId,
      experience: activeWalkthrough.experience,
    });
  }, [activeWalkthrough, completed, currentProgress, setActiveTutorial]);

  useEffect(
    () => () => {
      setActiveTutorial(null);
    },
    [setActiveTutorial],
  );

  useEffect(() => {
    if (runId === null || currentProgress === null || controllers.openWalkthrough === undefined)
      return;
    let active = true;
    void controllers
      .openWalkthrough({ runId, progress: copyProgress(currentProgress), locale })
      .then((value) => {
        if (!active) return;
        setActiveWalkthrough(value);
        setCompletionSummary(value.completionSummary);
      });
    return () => {
      active = false;
    };
  }, [controllers, currentProgress, locale, runId]);

  const observeTargetStatus = useCallback((status: TargetControlStatus, retry: () => void) => {
    retryTargetRef.current = retry;
    setTargetStatus(status);
  }, []);

  const targetSelector = stepView?.targetSelector ?? null;

  useEffect(() => {
    if (!destinationReady || stepView === undefined) return;
    rememberTutorialDestination(stepView.destinationHref);
  }, [destinationReady, stepView]);

  // The spotlight already owns locating, scrolling, and observing the target;
  // resolving the same selector once it reports readiness hands the panel the
  // live control for keyboard transfer without a second set of DOM observers.
  useEffect(() => {
    if (targetSelector === null || targetStatus !== 'ready') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a new step or a lost target invalidates the previous control
      setTargetControl(null);
      return;
    }

    try {
      setTargetControl(document.querySelector<HTMLElement>(targetSelector));
    } catch {
      setTargetControl(null);
    }
  }, [targetSelector, targetStatus]);

  const applyAdvanceResult = useCallback((result: AdvanceTutorialStepViewModel) => {
    if (!mounted.current) return;

    if (result.ok) {
      setProgress(result.progress);
      setDomFailure(null);
      setNoticeKey(null);
      return;
    }

    setProgress(result.progress);
    setDomFailure(DOM_FAILURE_REASONS[result.reason] ?? null);
    setNoticeKey(NOTICE_KEYS[result.reason] ?? null);
  }, []);

  const advance = useCallback(
    async (
      action: WalkthroughPendingAction,
      request: Parameters<AdvanceTutorialStepController>[0],
    ) => {
      setPendingAction(action);
      try {
        applyAdvanceResult(await controllers.advanceStep(request));
      } catch {
        if (mounted.current) setNoticeKey('tutorial.progressPersistenceFailure');
      } finally {
        if (mounted.current) setPendingAction(null);
      }
    },
    [applyAdvanceResult, controllers],
  );

  const goPrevious = () => {
    if (runId === null || activeWalkthrough === null) return;
    void advance('previous', {
      runId,
      tutorialId: activeWalkthrough.tutorialId,
      action: 'PREVIOUS',
      destinationReady,
    });
  };

  const goNext = () => {
    if (runId === null || activeWalkthrough === null || pendingAction !== null) return;
    void advance('forward', {
      runId,
      tutorialId: activeWalkthrough.tutorialId,
      action: 'NEXT',
      targetLocated: targetSelector === null ? true : targetStatus === 'ready',
      destinationReady,
    });
  };

  const finish = async () => {
    if (runId === null || currentProgress === null) return;

    setPendingAction('forward');
    try {
      // Unlike a Required Action, a final review step is completed by pressing
      // Finish itself. Include that final step in the progress sent to Core so
      // its ordered-prefix validation can atomically persist COMPLETED status.
      const finalProgress = copyProgress(
        markStepComplete(currentProgress, currentProgress.currentStepId),
      );
      const result = await controllers.completeRun({
        runId,
        progress: finalProgress,
      });
      if (!mounted.current) return;

      setProgress(result.progress);
      if (result.ok) {
        setActiveTutorial(null);
        setActiveRunId(null);
        setCompleted(true);
        setCompletionSummary((current) =>
          current === null ? null : { ...current, completedAt: result.completion.completedAt },
        );
        setNoticeKey(null);
      } else {
        setNoticeKey('tutorial.completionPersistenceFailure');
      }
    } catch {
      if (mounted.current) setNoticeKey('tutorial.completionPersistenceFailure');
    } finally {
      if (mounted.current) setPendingAction(null);
    }
  };

  const pause = async () => {
    if (activeWalkthrough === null || currentProgress === null) {
      onClose();
      return;
    }

    setPendingAction('pause');
    try {
      const result = await controllers.pauseRun({
        progress: copyProgress(currentProgress),
        steps: [...activeWalkthrough.steps],
        pausedAt: new Date().toISOString(),
        // Pause and close share one controller path, so the panel cannot tell
        // the two apart; both are a member request to stop here.
        trigger: 'USER_REQUEST',
      });
      if (!mounted.current) return;

      if (result.ok) {
        onClose();
      } else {
        setProgress(result.progress);
        setNoticeKey('tutorial.pausePersistenceFailure');
      }
    } catch {
      if (mounted.current) setNoticeKey('tutorial.pausePersistenceFailure');
    } finally {
      if (mounted.current) setPendingAction(null);
    }
  };

  const retry = () => {
    setDomFailure(null);
    setNoticeKey(null);
    retryTargetRef.current?.();
  };

  const requiredActionId = stepView?.requiredActionId ?? null;
  const tutorialId = activeWalkthrough?.tutorialId ?? null;

  // A target-only step describes an action on the highlighted Workspace
  // control itself (for example, opening Query from the rail). Treat that
  // activation as the step's Next action while leaving Required-Action steps
  // to their existing controller observers.
  useEffect(() => {
    if (
      targetControl === null ||
      runId === null ||
      activeWalkthrough === null ||
      pendingAction !== null ||
      requiredActionId !== null ||
      !destinationReady ||
      stepView?.step.forwardLabel === 'Finish'
    ) {
      return;
    }

    const targetIsTextControl =
      targetControl instanceof HTMLInputElement || targetControl instanceof HTMLTextAreaElement;
    const targetIsSelectControl = targetControl instanceof HTMLSelectElement;
    const targetIsValueControl = targetIsTextControl || targetIsSelectControl;
    const activationEvent = targetIsTextControl
      ? 'blur'
      : targetIsSelectControl
        ? 'change'
        : 'click';
    const advanceFromTarget = () => {
      if (targetIsValueControl && targetControl.value.trim() === '') {
        return;
      }
      if (targetControl instanceof HTMLAnchorElement) {
        const orderedSteps = [...activeWalkthrough.steps].sort(
          (left, right) => left.order - right.order,
        );
        const currentIndex = orderedSteps.findIndex(
          (step) => step.id === currentProgress?.currentStepId,
        );
        const nextStep = orderedSteps[currentIndex + 1];
        if (nextStep !== undefined) {
          rememberTutorialDestination(nextStep.destinationHref, targetControl.href);
        }
      }
      void advance('forward', {
        runId,
        tutorialId: activeWalkthrough.tutorialId,
        action: 'NEXT',
        targetLocated: true,
        destinationReady: true,
      });
    };

    targetControl.addEventListener(activationEvent, advanceFromTarget);
    return () => targetControl.removeEventListener(activationEvent, advanceFromTarget);
  }, [
    activeWalkthrough,
    advance,
    currentProgress?.currentStepId,
    destinationReady,
    pendingAction,
    requiredActionId,
    runId,
    stepView?.step.forwardLabel,
    targetControl,
  ]);

  useEffect(() => {
    if (runId === null || tutorialId === null || requiredActionId === null) return;
    if (!isWorkspaceRequiredActionId(requiredActionId)) return;

    return subscribeToWorkspaceRequiredAction(requiredActionId, async () => {
      const result = await controllers.advanceStep({
        runId,
        tutorialId,
        action: 'COMPLETE_ACTION',
        requiredActionSucceeded: true,
      });
      if (!mounted.current) return;
      setProgress(result.progress);
      setNoticeKey(result.ok ? null : 'tutorial.actionFailure');

      // Intermediate forms and dialogs commonly disappear as soon as their
      // Workspace operation succeeds. Move on immediately after Core records
      // that success, otherwise the spotlight reports its now-unmounted submit
      // button as missing and the member appears stuck. The final step still
      // remains in place so completion is an explicit Finish action.
      if (result.ok && stepView?.step.forwardLabel !== 'Finish') {
        await advance('forward', {
          runId,
          tutorialId,
          action: 'NEXT',
          targetLocated: true,
          destinationReady: true,
        });
      }
    });
  }, [advance, controllers, requiredActionId, runId, stepView?.step.forwardLabel, tutorialId]);

  if (activeWalkthrough === null || currentProgress === null || stepView === undefined) {
    return (
      <div className="grid gap-4 px-5 py-6">
        <PageAlert tone="warning">{t('tutorial.stepContentUnavailable')}</PageAlert>
        <Button className="justify-self-start" onClick={onClose} variant="outline">
          {t('tutorial.returnToWorkspace')}
        </Button>
      </div>
    );
  }

  if (completed && completionSummary !== null) {
    return (
      <CompletionSummary
        onOpenNextTutorial={onOpenTutorialDetail}
        onRepeatStarted={(result: RepeatedTutorialViewModel) => {
          const repeatedRunId = `${result.run.tutorialId}:${result.run.updatedAt}`;
          const openWalkthrough = controllers.openWalkthrough;
          if (openWalkthrough === undefined) {
            setActiveTutorial({
              tutorialId: activeWalkthrough.tutorialId,
              stepId: result.run.currentStepId,
              experience: activeWalkthrough.experience,
            });
            setActiveRunId(repeatedRunId);
            setCompleted(false);
            setProgress(result.run);
            onRepeatStarted?.(result.destinationHref);
            return;
          }
          void openWalkthrough({
            runId: repeatedRunId,
            progress: copyProgress(result.run),
            locale,
          }).then((value) => {
            if (!mounted.current) return;
            setActiveTutorial({
              tutorialId: value.tutorialId,
              stepId: result.run.currentStepId,
              experience: value.experience,
            });
            setActiveRunId(repeatedRunId);
            setActiveWalkthrough(value);
            setCompletionSummary(value.completionSummary);
            setCompleted(false);
            setProgress(result.run);
            onRepeatStarted?.(result.destinationHref);
          });
        }}
        onReturnToWorkspace={onClose}
        progress={currentProgress}
        repeatTutorial={controllers.repeatTutorial}
        summary={completionSummary}
      />
    );
  }

  const panelState: WalkthroughPanelState =
    domFailure !== null
      ? { kind: 'failure', reason: domFailure }
      : targetStatus === 'not-found'
        ? { kind: 'failure', reason: 'target-not-found' }
        : destinationReady
          ? READY_PANEL_STATE
          : { kind: 'preparing' };
  const isFinalStep = stepView.step.forwardLabel === 'Finish';

  return (
    <>
      {noticeKey === null ? null : (
        <div className="px-5 pt-4 min-[1024px]:px-6">
          <PageAlert tone="error">{t(noticeKey)}</PageAlert>
        </div>
      )}
      <WalkthroughPanel
        onForward={() => (isFinalStep ? void finish() : goNext())}
        onPause={() => void pause()}
        onPrevious={goPrevious}
        onRetry={retry}
        pendingAction={pendingAction}
        state={panelState}
        step={stepView.step}
        targetControl={targetControl}
      />
      {targetSelector === null ? null : (
        <SpotlightOverlay
          onTargetStatusChange={observeTargetStatus}
          targetDescription={
            stepView.step.targetAccessibleName === undefined
              ? ''
              : t('tutorial.targetControlDescription', {
                  name: stepView.step.targetAccessibleName,
                })
          }
          targetSelector={targetSelector}
        />
      )}
    </>
  );
}
