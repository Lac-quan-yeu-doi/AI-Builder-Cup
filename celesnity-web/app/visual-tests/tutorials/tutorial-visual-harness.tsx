'use client';

import type { ReactNode } from 'react';

import { CompletionSummary } from '@/app/_components/tutorials/completion-summary';
import { OnboardingInvitation } from '@/app/_components/tutorials/onboarding-invitation';
import { SpotlightOverlay } from '@/app/_components/tutorials/spotlight-overlay';
import { TutorialCatalogPanel } from '@/app/_components/tutorials/tutorial-catalog-panel';
import { TutorialDetailPanel } from '@/app/_components/tutorials/tutorial-detail-panel';
import { WalkthroughPanel } from '@/app/_components/tutorials/walkthrough-panel';
import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import type { OnboardingInvitationControllers } from '@/app/_components/tutorials/onboarding-invitation';
import type { ListTutorialCatalogController } from '@/src/interface-adapters/controllers/tutorials/list-tutorial-catalog.controller';
import type { RepeatTutorialController } from '@/src/interface-adapters/controllers/tutorials/repeat-tutorial.controller';
import type { CompletionSummaryViewModel } from '@/src/interface-adapters/presenters/completion.presenter';
import type { CatalogViewModel } from '@/src/interface-adapters/presenters/tutorial-catalog.presenter';
import type { DetailViewModel } from '@/src/interface-adapters/presenters/tutorial-detail.presenter';
import type { TutorialProgressViewModel } from '@/src/interface-adapters/presenters/tutorial-run.presenter';
import type { StepViewModel } from '@/src/interface-adapters/presenters/walkthrough.presenter';

export type TutorialVisualSurface =
  'catalog' | 'detail' | 'walkthrough' | 'spotlight' | 'onboarding' | 'completion';

interface TutorialVisualHarnessProps {
  readonly surface: TutorialVisualSurface;
}

const primaryTutorial = {
  id: 'tutorial-connections-basics',
  title: 'Create your first data connection',
  summary: 'Connect a trusted PostgreSQL source and verify that the workspace can reach it.',
  category: 'Getting started',
  learningOutcomes: ['Choose an authorized connection source', 'Verify connectivity before saving'],
  estimatedMinutes: 8,
  stepCount: 2,
  status: 'NOT_STARTED',
} as const;

const catalog: CatalogViewModel = {
  tutorials: [
    primaryTutorial,
    {
      id: 'tutorial-query-first-result',
      title: 'Run and inspect a SQL query',
      summary: 'Execute a query and understand the result status, timing, and returned columns.',
      category: 'Querying data',
      learningOutcomes: ['Run SQL in the query workspace', 'Read query result details'],
      estimatedMinutes: 6,
      stepCount: 1,
      status: 'PAUSED',
      progressPercentage: 0,
    },
  ],
  noResults: false,
};

const detail: DetailViewModel = {
  tutorialId: 'tutorial-connections-basics',
  experience: { mode: 'WORKSPACE' },
  metadata: {
    title: 'Create your first data connection',
    summary: 'Connect a trusted PostgreSQL source and verify that the workspace can reach it.',
    category: 'Getting started',
    learningOutcomes: [
      'Choose an authorized connection source',
      'Verify connectivity before saving',
    ],
    estimatedMinutes: 8,
    stepCount: 2,
  },
  prerequisiteStates: [],
  contextSelectors: [],
  startEnabled: true,
};

const spotlightStep: StepViewModel = {
  tutorialTitle: 'Create your first data connection',
  stepTitle: 'Open the connection editor',
  stepNumber: 1,
  totalSteps: 2,
  content: [
    { kind: 'text', text: 'Choose ' },
    { kind: 'emphasis', text: 'New connection' },
    { kind: 'text', text: ' in the workspace.' },
    { kind: 'action-callout', text: 'Open the connection editor to continue.' },
  ],
  targetAccessibleName: 'New connection',
  previousEnabled: false,
  forwardLabel: 'Next',
  forwardEnabled: true,
  selectedLocale: 'en',
  fallbackLocale: null,
};

const walkthroughStep: StepViewModel = {
  tutorialTitle: 'Create your first data connection',
  stepTitle: 'Review the connection checklist',
  stepNumber: 2,
  totalSteps: 2,
  content: [
    {
      kind: 'text',
      text: 'Confirm the host, database, and authentication details before you finish this tutorial.',
    },
  ],
  previousEnabled: true,
  forwardLabel: 'Finish',
  forwardEnabled: true,
  selectedLocale: 'en',
  fallbackLocale: null,
};

const completedProgress: TutorialProgressViewModel = {
  tutorialId: 'tutorial-connections-basics',
  memberId: 'visual-test-user',
  organizationId: 'visual-test-organization',
  status: 'COMPLETED',
  currentStepId: 'connection-step-review',
  completedStepIds: ['connection-step-open', 'connection-step-review'],
  contextSelections: [],
  updatedAt: '2026-09-15T09:45:00.000Z',
};

const completion: CompletionSummaryViewModel = {
  title: 'Create your first data connection',
  outcomes: ['Choose an authorized connection source', 'Verify connectivity before saving'],
  completedAt: '2026-09-15T09:45:00.000Z',
  nextRecommendation: {
    tutorialId: 'tutorial-query-first-result',
    title: 'Run and inspect a SQL query',
  },
  selectedLocale: 'en',
  fallbackLocale: null,
};

const listCatalog: ListTutorialCatalogController = async () => catalog;

const onboardingControllers: OnboardingInvitationControllers = {
  resolveOnboarding: async () => ({
    outcome: 'RECOMMENDATION_AVAILABLE',
    invitationVisible: true,
    recommendation: primaryTutorial,
  }),
  recordOnboardingDecision: async (input) =>
    input.decision === 'accepted'
      ? {
          outcome: 'OPEN_TUTORIAL_DETAIL',
          invitationVisible: false,
          tutorialId: input.tutorialId,
        }
      : { outcome: 'INVITATION_CLOSED', invitationVisible: false },
};

const repeatTutorial: RepeatTutorialController = async () => ({
  outcome: 'CONFIRMATION_REQUIRED',
  progress: completedProgress,
});

function TutorialSurfaceFrame({
  children,
  spotlight = false,
}: {
  readonly children: ReactNode;
  readonly spotlight?: boolean;
}) {
  const className = spotlight
    ? 'fixed right-0 bottom-0 left-0 z-50 h-[55dvh] min-h-0 w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain rounded-none border-0 py-0 [&_[data-tutorial-panel=walkthrough]]:h-full min-[1024px]:inset-y-0 min-[1024px]:left-auto min-[1024px]:h-dvh min-[1024px]:w-[24rem] min-[1024px]:rounded-l-2xl min-[1024px]:border-y min-[1024px]:border-l'
    : 'fixed inset-0 z-50 h-dvh min-h-0 w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain rounded-none border-0 py-0 min-[1024px]:left-auto min-[1024px]:w-[24rem] min-[1024px]:rounded-l-2xl min-[1024px]:border-y min-[1024px]:border-l';

  return (
    <Card asChild className={className}>
      <aside data-tutorial-visual-frame="">{children}</aside>
    </Card>
  );
}

function WorkspaceBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="grid h-dvh grid-cols-[14rem_1fr] bg-background text-foreground"
    >
      <div className="border-r border-border bg-muted p-5">
        <div className="text-title">Celesnity</div>
        <div className="mt-8 grid gap-3 text-body-sm text-muted-foreground">
          <span>Home</span>
          <span>Databases</span>
          <span>Query</span>
          <span>Guide</span>
        </div>
      </div>
      <div className="min-w-0 p-8">
        <p className="text-caption text-muted-foreground">Data connections</p>
        <h1 className="mt-2 text-heading-1">Connect your data</h1>
        <div className="mt-8 grid gap-4 min-[1024px]:grid-cols-2">
          <Card className="h-40 bg-card" />
          <Card className="h-40 bg-card" />
        </div>
        <Button className="absolute top-24 left-4 min-[1024px]:left-64" id="tutorial-visual-target">
          New connection
        </Button>
      </div>
    </div>
  );
}

function Walkthrough({ spotlight }: { readonly spotlight: boolean }) {
  const step = spotlight ? spotlightStep : walkthroughStep;
  return (
    <>
      <TutorialSurfaceFrame spotlight={spotlight}>
        <WalkthroughPanel
          onForward={() => undefined}
          onPause={() => undefined}
          onPrevious={() => undefined}
          onRetry={() => undefined}
          step={step}
        />
      </TutorialSurfaceFrame>
      {spotlight ? (
        <SpotlightOverlay
          targetDescription="Highlighted control: New connection."
          targetSelector="#tutorial-visual-target"
        />
      ) : null}
    </>
  );
}

export function TutorialVisualHarness({ surface }: TutorialVisualHarnessProps) {
  return (
    <main className="relative h-dvh overflow-hidden bg-background text-foreground">
      <WorkspaceBackdrop />
      {surface === 'onboarding' ? (
        <OnboardingInvitation
          controllers={onboardingControllers}
          onOpenTutorialDetail={() => undefined}
          visibleWhileResolving
        />
      ) : null}
      {surface === 'catalog' ? (
        <TutorialSurfaceFrame>
          <TutorialCatalogPanel
            listCatalog={listCatalog}
            onClose={() => undefined}
            onSelectTutorial={() => undefined}
          />
        </TutorialSurfaceFrame>
      ) : null}
      {surface === 'detail' ? (
        <TutorialSurfaceFrame>
          <TutorialDetailPanel
            detail={detail}
            onContextSelectionChange={() => undefined}
            onStart={() => undefined}
          />
        </TutorialSurfaceFrame>
      ) : null}
      {surface === 'walkthrough' ? <Walkthrough spotlight={false} /> : null}
      {surface === 'spotlight' ? <Walkthrough spotlight /> : null}
      {surface === 'completion' ? (
        <TutorialSurfaceFrame>
          <CompletionSummary
            onOpenNextTutorial={() => undefined}
            onRepeatStarted={() => undefined}
            progress={completedProgress}
            repeatTutorial={repeatTutorial}
            summary={completion}
          />
        </TutorialSurfaceFrame>
      ) : null}
    </main>
  );
}
