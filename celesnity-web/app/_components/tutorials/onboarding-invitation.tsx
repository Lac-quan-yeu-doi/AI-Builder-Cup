'use client';

import { LoaderCircleIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/app/_components/ui/card';
import { InlineError } from '@/app/_components/ui/page-alert';
import { useTranslation } from '@/app/_i18n/use-translation';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import type { RecordOnboardingDecisionController } from '@/src/interface-adapters/controllers/tutorials/record-onboarding-decision.controller';
import type { ResolveOnboardingController } from '@/src/interface-adapters/controllers/tutorials/resolve-onboarding.controller';
import type { ResolvedOnboardingViewModel } from '@/src/interface-adapters/presenters/onboarding.presenter';

export interface OnboardingInvitationControllers {
  readonly resolveOnboarding: ResolveOnboardingController;
  readonly recordOnboardingDecision: RecordOnboardingDecisionController;
}

export interface OnboardingInvitationProps {
  readonly controllers: OnboardingInvitationControllers;
  readonly onOpenTutorialDetail: (tutorialId: string) => void;
  readonly visibleWhileResolving?: boolean;
}

type PendingDecision = 'accepted' | 'dismissed' | null;

/**
 * Optional, non-modal onboarding prompt. It intentionally has no backdrop,
 * focus trap, or page-sized hit target so the Workspace remains operable.
 */
export function OnboardingInvitation({
  controllers,
  onOpenTutorialDetail,
  visibleWhileResolving = false,
}: OnboardingInvitationProps) {
  const { t } = useTranslation();
  const setOpenSurface = useTutorialSessionStore((state) => state.setOpenSurface);
  const mounted = useRef(true);
  const [invitation, setInvitation] = useState<ResolvedOnboardingViewModel | null>(null);
  const [pendingDecision, setPendingDecision] = useState<PendingDecision>(null);
  const [persistenceFailed, setPersistenceFailed] = useState(false);

  useEffect(() => {
    mounted.current = true;
    let active = true;

    const resolveOnboarding = async () => {
      if (typeof controllers.resolveOnboarding !== 'function') return;

      try {
        const resolved = await controllers.resolveOnboarding();
        if (!active || !resolved) return;
        setInvitation(resolved);
        setOpenSurface(resolved.invitationVisible ? 'onboarding' : 'none');
      } catch {
        // Resolution failures do not know whether a decision exists, so fail
        // closed rather than presenting an invitation that may be unwanted.
      }
    };

    void resolveOnboarding();

    return () => {
      active = false;
      mounted.current = false;
    };
  }, [controllers, setOpenSurface]);

  const recordDecision = async (decision: 'accepted' | 'dismissed', tutorialId?: string) => {
    setPendingDecision(decision);
    setPersistenceFailed(false);

    try {
      const result = await controllers.recordOnboardingDecision(
        decision === 'accepted' && tutorialId
          ? { decision, tutorialId }
          : { decision: 'dismissed' },
      );

      if (!mounted.current) return;

      switch (result.outcome) {
        case 'OPEN_TUTORIAL_DETAIL':
          setInvitation({ outcome: 'NOT_PRESENTED', invitationVisible: false });
          onOpenTutorialDetail(result.tutorialId);
          return;
        case 'INVITATION_CLOSED':
          setInvitation({ outcome: 'NOT_PRESENTED', invitationVisible: false });
          setOpenSurface('none');
          return;
        case 'PERSISTENCE_FAILED':
          setPersistenceFailed(true);
          break;
      }
    } catch {
      if (mounted.current) setPersistenceFailed(true);
    } finally {
      if (mounted.current) setPendingDecision(null);
    }
  };

  const invitationVisible = invitation?.invitationVisible ?? visibleWhileResolving;
  if (!invitationVisible) return null;

  const recommendation =
    invitation?.outcome === 'RECOMMENDATION_AVAILABLE' ? invitation.recommendation : null;
  const noStarterAvailable = invitation?.outcome === 'NO_STARTER_AVAILABLE';
  const isSaving = pendingDecision !== null;

  return (
    <Card
      asChild
      className="fixed right-4 bottom-20 left-4 z-40 max-h-[calc(100dvh-6rem)] overflow-y-auto shadow-300 min-[1024px]:left-auto min-[1024px]:w-96"
    >
      <aside aria-labelledby="onboarding-invitation-title" data-tutorial-surface="onboarding">
        <CardHeader>
          <CardTitle>
            <h2 id="onboarding-invitation-title">{t('tutorial.onboardingTitle')}</h2>
          </CardTitle>
          <CardDescription>{t('tutorial.onboardingDescription')}</CardDescription>
        </CardHeader>

        {recommendation ? (
          <CardContent className="grid gap-3">
            <p className="text-caption text-muted-foreground">
              {t('tutorial.onboardingRecommendation')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-title">{recommendation.title}</h3>
              <Badge variant="secondary">{recommendation.category}</Badge>
            </div>
            <p className="text-body-sm text-muted-foreground">{recommendation.summary}</p>
            <p className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
              <span>
                {t(
                  recommendation.estimatedMinutes === 1
                    ? 'tutorial.estimatedMinute'
                    : 'tutorial.estimatedMinutes',
                  { count: recommendation.estimatedMinutes },
                )}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {t(
                  recommendation.stepCount === 1
                    ? 'tutorial.stepCountSingular'
                    : 'tutorial.stepCount',
                  { count: recommendation.stepCount },
                )}
              </span>
            </p>
          </CardContent>
        ) : null}

        {noStarterAvailable ? (
          <CardContent className="grid gap-2">
            <h3 className="text-title">{t('tutorial.onboardingNoStarterTitle')}</h3>
            <p className="text-body-sm text-muted-foreground">
              {t('tutorial.onboardingNoStarterDescription')}
            </p>
          </CardContent>
        ) : null}

        {persistenceFailed ? (
          <CardContent>
            <InlineError>{t('tutorial.onboardingPersistenceError')}</InlineError>
          </CardContent>
        ) : null}

        {recommendation || noStarterAvailable ? (
          <CardFooter className="flex flex-wrap justify-end gap-2">
            <Button
              aria-busy={pendingDecision === 'dismissed'}
              disabled={isSaving}
              onClick={() => void recordDecision('dismissed')}
              variant="outline"
            >
              {pendingDecision === 'dismissed' ? (
                <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
              ) : null}
              {pendingDecision === 'dismissed'
                ? t('tutorial.onboardingSaving')
                : t(
                    noStarterAvailable ? 'tutorial.onboardingDismiss' : 'tutorial.onboardingNotNow',
                  )}
            </Button>
            {recommendation ? (
              <Button
                aria-busy={pendingDecision === 'accepted'}
                disabled={isSaving}
                onClick={() => void recordDecision('accepted', recommendation.id)}
              >
                {pendingDecision === 'accepted' ? (
                  <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
                ) : null}
                {pendingDecision === 'accepted'
                  ? t('tutorial.onboardingSaving')
                  : t('tutorial.onboardingViewTutorial')}
              </Button>
            ) : null}
          </CardFooter>
        ) : null}
      </aside>
    </Card>
  );
}
