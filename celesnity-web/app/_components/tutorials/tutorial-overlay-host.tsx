'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { OnboardingInvitation } from '@/app/_components/tutorials/onboarding-invitation';
import { TutorialCatalogPanel } from '@/app/_components/tutorials/tutorial-catalog-panel';
import { resolveTutorialDestination } from '@/app/_components/tutorials/tutorial-destination-memory';
import {
  TutorialDetailSurface,
  type TutorialLaunchRequest,
  type TutorialResumeRequest,
} from '@/app/_components/tutorials/tutorial-detail-surface';
import {
  WalkthroughLifecycleHost,
  type WalkthroughLaunchReport,
  type WalkthroughLifecycleLaunch,
} from '@/app/_components/tutorials/walkthrough-lifecycle-host';
import {
  WalkthroughSurface,
  type ActiveWalkthrough,
} from '@/app/_components/tutorials/walkthrough-surface';
import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import { PageAlert } from '@/app/_components/ui/page-alert';
import type { TranslationKey } from '@/app/_i18n/en';
import { useTranslation } from '@/app/_i18n/use-translation';
import {
  type TutorialSurface,
  useTutorialSessionStore,
} from '@/app/_stores/tutorial-session.store';
import { getInjection } from '@/di/container';
import type { TutorialExperience } from '@/src/entities/models/tutorial-definition';

const controllers = Object.freeze({
  listCatalog: getInjection('ListTutorialCatalogController'),
  openDetail: getInjection('OpenTutorialDetailController'),
  openWalkthrough: getInjection('OpenTutorialWalkthroughController'),
  startRun: getInjection('StartTutorialRunController'),
  advanceStep: getInjection('AdvanceTutorialStepController'),
  pauseRun: getInjection('PauseTutorialRunController'),
  resumeRun: getInjection('ResumeTutorialRunController'),
  completeRun: getInjection('CompleteTutorialRunController'),
  repeatTutorial: getInjection('RepeatTutorialController'),
  resolveOnboarding: getInjection('ResolveOnboardingController'),
  recordOnboardingDecision: getInjection('RecordOnboardingDecisionController'),
  // The signed-in member and current organization that StartTutorialRunInput
  // requires; no tutorial controller exposes them.
  loadSession: getInjection('LoadAdministrationSessionController'),
});

type ActiveTutorialSurface = Exclude<TutorialSurface, 'none'>;
type TutorialSurfaceVariant = 'panel' | 'walkthrough';

type LaunchNotice = 'CANCELLED' | 'PAUSE_FAILED' | 'RESUME_CANCELLED' | 'RESUME_BLOCKED' | 'FAILED';

const LAUNCH_NOTICE_KEYS: Readonly<Record<LaunchNotice, TranslationKey>> = Object.freeze({
  CANCELLED: 'tutorial.startCancelled',
  PAUSE_FAILED: 'tutorial.startPauseFailed',
  RESUME_CANCELLED: 'tutorial.resumeCancelled',
  RESUME_BLOCKED: 'tutorial.resumeUnavailable',
  FAILED: 'tutorial.startFailure',
});

const FRAME_CLASSES: Readonly<Record<TutorialSurfaceVariant, string>> = Object.freeze({
  panel:
    'fixed inset-0 z-50 h-dvh min-h-0 w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain rounded-none border-0 py-0 min-[1024px]:left-auto min-[1024px]:w-[24rem] min-[1024px]:rounded-l-2xl min-[1024px]:border-y min-[1024px]:border-l',
  // A walkthrough guides the member through the live Workspace, so on a narrow
  // viewport it yields the upper half of the screen to the destination instead
  // of covering it.
  walkthrough:
    'fixed right-0 bottom-0 left-0 z-50 h-[55dvh] min-h-0 w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain rounded-none border-0 py-0 [&_[data-tutorial-panel=walkthrough]]:h-full min-[1024px]:inset-y-0 min-[1024px]:left-auto min-[1024px]:h-dvh min-[1024px]:w-[24rem] min-[1024px]:rounded-l-2xl min-[1024px]:border-y min-[1024px]:border-l',
});

interface TutorialSurfaceFrameProps {
  readonly accessibleName: string;
  readonly children?: ReactNode;
  readonly surface: ActiveTutorialSurface;
  readonly variant?: TutorialSurfaceVariant;
}

/**
 * Shared viewport boundary for every tutorial surface. Surface-specific tasks
 * render their content inside this landmark; the host owns placement so a
 * surface cannot accidentally introduce a different breakpoint contract.
 */
function TutorialSurfaceFrame({
  accessibleName,
  children,
  surface,
  variant = 'panel',
}: TutorialSurfaceFrameProps) {
  return (
    <Card asChild className={FRAME_CLASSES[variant]}>
      <aside aria-label={accessibleName} data-tutorial-surface={surface}>
        {children}
      </aside>
    </Card>
  );
}

/**
 * Workspace-level host for tutorial catalog, onboarding, detail, and
 * walkthrough overlays.
 *
 * Controllers are resolved exactly once at the frozen module-scope root above
 * and handed down; the surfaces below stay presentational. Which surface is open
 * and which run is active are transient session state, so they live in Zustand;
 * everything a surface shows comes from a controller.
 */
export function TutorialOverlayHost() {
  const openSurface = useTutorialSessionStore((state) => state.openSurface);
  const setOpenSurface = useTutorialSessionStore((state) => state.setOpenSurface);
  const setActiveExperience = useTutorialSessionStore((state) => state.setActiveExperience);
  const [selectedTutorialId, setSelectedTutorialId] = useState<string | null>(null);
  const [launchRequest, setLaunchRequest] = useState<TutorialLaunchRequest | null>(null);
  const [resumeRequest, setResumeRequest] = useState<TutorialResumeRequest | null>(null);
  const [launchNotice, setLaunchNotice] = useState<LaunchNotice | null>(null);
  const [activeWalkthrough, setActiveWalkthrough] = useState<ActiveWalkthrough | null>(null);
  const router = useRouter();
  const { locale, t } = useTranslation();

  const navigate = useCallback(
    (destinationHref: string) => router.push(resolveTutorialDestination(destinationHref)),
    [router],
  );

  const openTutorialDetail = useCallback(
    (tutorialId: string) => {
      setSelectedTutorialId(tutorialId);
      setLaunchRequest(null);
      setResumeRequest(null);
      setLaunchNotice(null);
      setActiveWalkthrough(null);
      setActiveExperience(null);
      setOpenSurface('detail');
    },
    [setActiveExperience, setOpenSurface],
  );

  const leaveWalkthrough = useCallback(
    (surface: TutorialSurface) => {
      setLaunchRequest(null);
      setResumeRequest(null);
      setLaunchNotice(null);
      setActiveExperience(null);
      setOpenSurface(surface);
    },
    [setActiveExperience, setOpenSurface],
  );

  const startRun = useCallback(
    (request: TutorialLaunchRequest, experience: TutorialExperience) => {
      setLaunchNotice(null);
      setActiveWalkthrough(null);
      setResumeRequest(null);
      setLaunchRequest(request);
      setActiveExperience(experience);
      setOpenSurface('walkthrough');
    },
    [setActiveExperience, setOpenSurface],
  );

  const resumeRun = useCallback(
    (request: TutorialResumeRequest) => {
      setLaunchNotice(null);
      setActiveWalkthrough(null);
      setLaunchRequest(null);
      setResumeRequest(request);
      setActiveExperience(null);
      setOpenSurface('walkthrough');
    },
    [setActiveExperience, setOpenSurface],
  );

  // Identity is part of the memoized launch so the lifecycle host runs the start
  // exactly once per request rather than on every host render.
  const launch = useMemo<WalkthroughLifecycleLaunch | null>(
    () =>
      launchRequest !== null
        ? {
            kind: 'start',
            execute: (conflictResolution) =>
              controllers.startRun(
                conflictResolution === undefined
                  ? launchRequest
                  : { ...launchRequest, conflictResolution },
              ),
          }
        : resumeRequest !== null
          ? {
              kind: 'resume',
              execute: (destinationReady, conflictResolution) =>
                controllers.resumeRun({
                  ...resumeRequest,
                  destinationReady,
                  resumedAt: new Date().toISOString(),
                  ...(conflictResolution === undefined ? {} : { conflictResolution }),
                }),
            }
          : null,
    [launchRequest, resumeRequest],
  );

  const reportLaunch = useCallback(
    (report: WalkthroughLaunchReport) => {
      if (report.kind === 'failed') {
        setActiveExperience(null);
        setLaunchNotice('FAILED');
        return;
      }
      if (report.kind === 'resume') {
        if (report.result.outcome === 'RESUMED') {
          const progress = report.result.progress;
          void controllers
            .openWalkthrough({
              runId: `${progress.tutorialId}:${progress.updatedAt}`,
              progress: {
                ...progress,
                completedStepIds: [...progress.completedStepIds],
                contextSelections: progress.contextSelections.map((selection) => ({
                  ...selection,
                })),
              },
              locale,
            })
            .then(setActiveWalkthrough, () => setLaunchNotice('FAILED'));
        } else if (
          report.result.outcome === 'BLOCKED' &&
          (report.result.blockers.blockingFeatureIds.length > 0 ||
            report.result.blockers.unsatisfiedPrerequisiteIds.length > 0 ||
            report.result.blockers.replacementRequiredRequirementIds.length > 0)
        ) {
          setActiveExperience(null);
          setLaunchNotice('RESUME_BLOCKED');
        } else if (report.result.outcome === 'CANCELLED') {
          setActiveExperience(null);
          setLaunchNotice('RESUME_CANCELLED');
        } else if (report.result.outcome === 'PAUSE_FAILED') {
          setActiveExperience(null);
          setLaunchNotice('PAUSE_FAILED');
        }
        return;
      }
      if (report.result.outcome === 'STARTED') {
        const progress = report.result.run;
        void controllers
          .openWalkthrough({
            runId: `${progress.tutorialId}:${progress.updatedAt}`,
            progress: {
              ...progress,
              completedStepIds: [...progress.completedStepIds],
              contextSelections: progress.contextSelections.map((selection) => ({ ...selection })),
            },
            locale,
          })
          .then(setActiveWalkthrough, () => setLaunchNotice('FAILED'));
        return;
      }
      if (report.result.outcome === 'CANCELLED' || report.result.outcome === 'PAUSE_FAILED') {
        setActiveExperience(null);
        setLaunchNotice(report.result.outcome);
      }
    },
    [locale, setActiveExperience],
  );

  switch (openSurface) {
    case 'catalog':
      return (
        <TutorialSurfaceFrame accessibleName={t('tutorial.catalogLabel')} surface="catalog">
          <TutorialCatalogPanel
            listCatalog={controllers.listCatalog}
            onClose={() => setOpenSurface('none')}
            onSelectTutorial={openTutorialDetail}
          />
        </TutorialSurfaceFrame>
      );
    case 'detail':
      return (
        <TutorialSurfaceFrame accessibleName={t('tutorial.detailLabel')} surface="detail">
          {selectedTutorialId === null ? null : (
            <TutorialDetailSurface
              controllers={controllers}
              key={selectedTutorialId}
              onBackToCatalog={() => setOpenSurface('catalog')}
              onResume={resumeRun}
              onStart={startRun}
              tutorialId={selectedTutorialId}
            />
          )}
        </TutorialSurfaceFrame>
      );
    case 'onboarding':
      return (
        <OnboardingInvitation
          controllers={controllers}
          onOpenTutorialDetail={openTutorialDetail}
          visibleWhileResolving
        />
      );
    case 'walkthrough':
      return (
        <TutorialSurfaceFrame
          accessibleName={t('tutorial.walkthroughLabel')}
          surface="walkthrough"
          variant="walkthrough"
        >
          {launchNotice !== null ? (
            <div className="grid gap-4 px-5 py-6">
              <PageAlert tone="warning">{t(LAUNCH_NOTICE_KEYS[launchNotice])}</PageAlert>
              <Button
                className="justify-self-start"
                onClick={() => leaveWalkthrough('catalog')}
                variant="outline"
              >
                {t('tutorial.backToCatalog')}
              </Button>
            </div>
          ) : launch === null ? (
            <WalkthroughSurface
              controllers={controllers}
              onClose={() => leaveWalkthrough('none')}
              onOpenTutorialDetail={openTutorialDetail}
              walkthrough={activeWalkthrough}
            />
          ) : (
            <WalkthroughLifecycleHost
              launch={launch}
              navigate={navigate}
              onLaunchResult={reportLaunch}
              pending={
                <p className="px-5 py-6 text-body-sm text-muted-foreground" role="status">
                  {t('tutorial.destinationPreparing')}
                </p>
              }
            >
              {activeWalkthrough === null ? (
                <p className="px-5 py-6 text-body-sm text-muted-foreground" role="status">
                  {t('tutorial.destinationPreparing')}
                </p>
              ) : (
                <WalkthroughSurface
                  controllers={controllers}
                  onClose={() => leaveWalkthrough('none')}
                  onOpenTutorialDetail={openTutorialDetail}
                  onRepeatStarted={navigate}
                  walkthrough={activeWalkthrough}
                />
              )}
            </WalkthroughLifecycleHost>
          )}
        </TutorialSurfaceFrame>
      );
    case 'none':
      return (
        <OnboardingInvitation controllers={controllers} onOpenTutorialDetail={openTutorialDetail} />
      );
  }
}
