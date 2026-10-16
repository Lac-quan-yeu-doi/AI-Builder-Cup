'use client';

import { ChevronLeftIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { TutorialDetailPanel } from '@/app/_components/tutorials/tutorial-detail-panel';
import { useTutorialSurfaceFocus } from '@/app/_components/tutorials/use-tutorial-surface-focus';
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
import { PageAlert } from '@/app/_components/ui/page-alert';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { LoadAdministrationSessionController } from '@/src/interface-adapters/controllers/administration/load-administration-session.controller';
import type { OpenTutorialDetailController } from '@/src/interface-adapters/controllers/tutorials/open-tutorial-detail.controller';
import type { StartTutorialRunInput } from '@/src/interface-adapters/controllers/tutorials/tutorial.schemas';
import type { ResumeTutorialRunInput } from '@/src/interface-adapters/controllers/tutorials/tutorial.schemas';
import type { DetailViewModel } from '@/src/interface-adapters/presenters/tutorial-detail.presenter';
import type { TutorialExperience } from '@/src/entities/models/tutorial-definition';

export interface TutorialDetailSurfaceControllers {
  readonly openDetail: OpenTutorialDetailController;
  /**
   * The only client-side source of the signed-in member and current
   * organization, which `StartTutorialRunInput` requires. Resolved lazily on
   * Start so members who only browse the catalog pay no extra request.
   */
  readonly loadSession: LoadAdministrationSessionController;
}

/** Everything `StartTutorialRunController` needs, collected before the run starts. */
export type TutorialLaunchRequest = Omit<StartTutorialRunInput, 'conflictResolution'>;
export type TutorialResumeRequest = Omit<ResumeTutorialRunInput, 'destinationReady' | 'resumedAt'>;

export interface TutorialDetailSurfaceProps {
  readonly controllers: TutorialDetailSurfaceControllers;
  readonly tutorialId: string;
  readonly onBackToCatalog: () => void;
  readonly onStart: (launch: TutorialLaunchRequest, experience: TutorialExperience) => void;
  readonly onResume: (launch: TutorialResumeRequest) => void;
}

/** One chosen resource, tracked per context selector slot rather than per requirement. */
interface ContextSelectionDraft {
  readonly selectorId: string;
  readonly requirementId: string;
  readonly resourceType: string;
  readonly resourceId: string;
}

type DetailStatus = 'loading' | 'ready' | 'error';

function toControllerSelections(
  drafts: readonly ContextSelectionDraft[],
): TutorialLaunchRequest['contextSelections'] {
  return drafts.map(({ requirementId, resourceType, resourceId }) => ({
    requirementId,
    resourceType,
    resourceId,
  }));
}

function effectiveControllerSelections(
  detail: DetailViewModel,
  drafts: readonly ContextSelectionDraft[],
): TutorialLaunchRequest['contextSelections'] {
  const draftsBySelectorId = new Map(drafts.map((draft) => [draft.selectorId, draft]));

  return detail.contextSelectors.flatMap((selector) => {
    const draft = draftsBySelectorId.get(selector.id);
    const resourceId = draft?.resourceId ?? selector.selectedResourceId;
    return resourceId === null
      ? []
      : [
          {
            requirementId: selector.requirementId,
            resourceType: selector.resourceType,
            resourceId,
          },
        ];
  });
}

/**
 * Tutorial-readiness surface for one selected tutorial.
 *
 * Every eligibility decision stays with `OpenTutorialDetailController`: changing
 * a context selection re-resolves the whole detail through the controller rather
 * than recomputing `startEnabled` here. Start only collects the identity and
 * selections the start input requires and hands them to the host, which owns the
 * run lifecycle.
 */
export function TutorialDetailSurface({
  controllers,
  tutorialId,
  onBackToCatalog,
  onStart,
  onResume,
}: TutorialDetailSurfaceProps) {
  const { t } = useTranslation();
  const backRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const [status, setStatus] = useState<DetailStatus>('loading');
  const [detail, setDetail] = useState<DetailViewModel | null>(null);
  const [selections, setSelections] = useState<readonly ContextSelectionDraft[]>([]);
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const [freshConfirmationOpen, setFreshConfirmationOpen] = useState(false);

  useTutorialSurfaceFocus(backRef, status !== 'loading');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void controllers
      .openDetail({
        tutorialId,
        // The client has no prerequisite evaluation source; the use case decides
        // what an empty evaluation set means for this tutorial.
        prerequisiteEvaluations: [],
        contextSelections: toControllerSelections(selections),
      })
      .then(
        (value) => {
          if (!active) return;
          setDetail(value);
          setStatus('ready');
        },
        () => {
          if (active) setStatus('error');
        },
      );

    return () => {
      active = false;
    };
  }, [controllers, selections, tutorialId]);

  const changeSelection = (selectorId: string, resourceId: string) => {
    if (detail === null) return;
    const selectors = detail.contextSelectors;

    setSelections((current) => {
      const bySelectorId = new Map(current.map((draft) => [draft.selectorId, draft]));
      const selector = selectors.find((candidate) => candidate.id === selectorId);
      if (selector === undefined) return current;

      bySelectorId.set(selectorId, {
        selectorId,
        requirementId: selector.requirementId,
        resourceType: selector.resourceType,
        resourceId,
      });

      // Slot order follows the presented selector order so the use case pairs
      // each selection with the requirement slot the member filled in.
      return selectors.flatMap((candidate) => {
        const draft = bySelectorId.get(candidate.id);
        return draft === undefined ? [] : [draft];
      });
    });
  };

  const start = async () => {
    if (detail === null) return;
    setStarting(true);
    setStartFailed(false);

    try {
      const session = await controllers.loadSession();
      if (!mounted.current) return;

      onStart(
        {
          tutorialId,
          memberId: session.identityId,
          organizationId: session.organization.organizationId,
          contextSelections: effectiveControllerSelections(detail, selections),
        },
        detail.experience ?? { mode: 'WORKSPACE' },
      );
    } catch {
      if (mounted.current) {
        setStartFailed(true);
        setStarting(false);
      }
    }
  };

  const resume = () => {
    if (detail?.progress === undefined) return;
    onResume({
      progress: {
        ...detail.progress,
        completedStepIds: [...detail.progress.completedStepIds],
        contextSelections: detail.progress.contextSelections.map((selection) => ({ ...selection })),
      },
      prerequisiteEvaluations: detail.prerequisiteStates.map((prerequisite) => ({
        id: prerequisite.id,
        satisfied: prerequisite.satisfied,
      })),
      replacementContextSelections: effectiveControllerSelections(detail, selections),
    });
  };

  const mustRestart =
    detail?.experience?.mode === 'SIMULATED_CHAT' &&
    (detail.progress?.status === 'PAUSED' || detail.progress?.status === 'IN_PROGRESS');

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 min-[1024px]:px-5">
        <Button onClick={onBackToCatalog} ref={backRef} size="sm" variant="ghost">
          <ChevronLeftIcon aria-hidden="true" />
          {t('tutorial.backToCatalog')}
        </Button>
      </div>

      {status === 'loading' ? (
        <p className="px-5 py-6 text-body-sm text-muted-foreground" role="status">
          {t('tutorial.detailLoading')}
        </p>
      ) : null}

      {status === 'error' ? (
        <div className="px-5 py-6">
          <PageAlert tone="error">{t('tutorial.detailLoadError')}</PageAlert>
        </div>
      ) : null}

      {status === 'ready' && detail !== null ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {startFailed ? (
            <div className="px-5 pt-5">
              <PageAlert tone="error">{t('tutorial.startFailure')}</PageAlert>
            </div>
          ) : null}
          <TutorialDetailPanel
            action={
              mustRestart
                ? 'restart'
                : detail.progress?.status === 'PAUSED'
                  ? 'resume'
                  : detail.progress?.status === 'IN_PROGRESS'
                    ? 'continue'
                    : detail.progress?.status === 'COMPLETED'
                      ? 'repeat'
                      : 'start'
            }
            detail={detail}
            onContextSelectionChange={changeSelection}
            onStartFresh={
              !mustRestart &&
              (detail.progress?.status === 'PAUSED' || detail.progress?.status === 'IN_PROGRESS')
                ? () => setFreshConfirmationOpen(true)
                : undefined
            }
            onStart={() =>
              mustRestart
                ? setFreshConfirmationOpen(true)
                : detail.progress?.status === 'PAUSED' || detail.progress?.status === 'IN_PROGRESS'
                  ? resume()
                  : detail.progress?.status === 'COMPLETED'
                    ? setFreshConfirmationOpen(true)
                    : void start()
            }
            starting={starting}
          />
          <AlertDialog onOpenChange={setFreshConfirmationOpen} open={freshConfirmationOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('tutorial.startFreshConfirmationTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('tutorial.startFreshConfirmationDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('tutorial.cancelStartFresh')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault();
                    setFreshConfirmationOpen(false);
                    void start();
                  }}
                >
                  {t('tutorial.confirmStartFresh')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
    </div>
  );
}
