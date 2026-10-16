// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({
  listCatalog: vi.fn(),
  openDetail: vi.fn(),
  openWalkthrough: vi.fn(),
  repeatTutorial: vi.fn(),
  resumeRun: vi.fn(),
  startRun: vi.fn(),
  loadSession: vi.fn(),
  resolveOnboarding: vi.fn(),
}));

const router = vi.hoisted(() => ({
  push: vi.fn((href: string) => {
    window.history.pushState(null, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock('@/di/container', () => ({
  getInjection: vi.fn((token: string) => {
    switch (token) {
      case 'ListTutorialCatalogController':
        return controllerMocks.listCatalog;
      case 'OpenTutorialDetailController':
        return controllerMocks.openDetail;
      case 'OpenTutorialWalkthroughController':
        return controllerMocks.openWalkthrough;
      case 'RepeatTutorialController':
        return controllerMocks.repeatTutorial;
      case 'StartTutorialRunController':
        return controllerMocks.startRun;
      case 'ResumeTutorialRunController':
        return controllerMocks.resumeRun;
      case 'LoadAdministrationSessionController':
        return controllerMocks.loadSession;
      case 'ResolveOnboardingController':
        return controllerMocks.resolveOnboarding;
      default:
        return vi.fn();
    }
  }),
}));

import { TutorialOverlayHost } from '@/app/_components/tutorials/tutorial-overlay-host';
import { defaultLocale } from '@/app/_i18n/locales';
import { useLocaleStore } from '@/app/_stores/locale.store';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import type { DetailViewModel } from '@/src/interface-adapters/presenters/tutorial-detail.presenter';
import type {
  StartTutorialRunViewModel,
  TutorialProgressViewModel,
} from '@/src/interface-adapters/presenters/tutorial-run.presenter';
import { renderUi as render } from '@/tests/support/render-ui';

const catalogTutorial = {
  id: 'tutorial-connections',
  title: 'Connect a database',
  summary: 'Register a source and confirm the workspace can read it.',
  category: 'Getting started',
  learningOutcomes: ['Register a source'],
  estimatedMinutes: 6,
  stepCount: 2,
  status: 'NOT_STARTED',
} as const;

const contextSelector = {
  id: 'database-service:1',
  requirementId: 'database-service',
  resourceType: 'DATABASE_SERVICE',
  options: [
    { id: 'service-1', name: 'analytics-primary' },
    { id: 'service-2', name: 'legacy-reporting' },
  ],
  selectedResourceId: null,
  selectedResourceName: null,
} as const satisfies DetailViewModel['contextSelectors'][number];

const chosenSelection = {
  requirementId: contextSelector.requirementId,
  resourceType: contextSelector.resourceType,
  resourceId: 'service-1',
} as const;

const baseDetail: DetailViewModel = {
  tutorialId: catalogTutorial.id,
  experience: { mode: 'WORKSPACE' },
  metadata: {
    title: catalogTutorial.title,
    summary: catalogTutorial.summary,
    category: catalogTutorial.category,
    learningOutcomes: [...catalogTutorial.learningOutcomes],
    estimatedMinutes: catalogTutorial.estimatedMinutes,
    stepCount: catalogTutorial.stepCount,
  },
  prerequisiteStates: [],
  contextSelectors: [contextSelector],
  startEnabled: false,
};

const selectedDetail: DetailViewModel = {
  ...baseDetail,
  contextSelectors: [
    {
      ...contextSelector,
      selectedResourceId: 'service-1',
      selectedResourceName: 'analytics-primary',
    },
  ],
  startEnabled: true,
};

const startedRun: TutorialProgressViewModel = {
  tutorialId: catalogTutorial.id,
  memberId: 'identity-1',
  organizationId: 'organization-1',
  status: 'IN_PROGRESS',
  currentStepId: 'step-open-databases',
  completedStepIds: [],
  contextSelections: [chosenSelection],
  updatedAt: '2026-03-04T05:06:07.000Z',
};

const started: StartTutorialRunViewModel = {
  outcome: 'STARTED',
  run: startedRun,
  destinationHref: '/catalog/databases',
};

const activeWalkthrough = {
  runId: `${startedRun.tutorialId}:${startedRun.updatedAt}`,
  tutorialId: startedRun.tutorialId,
  progress: startedRun,
  stepViews: new Map([
    [
      'step-open-databases',
      {
        step: {
          tutorialTitle: catalogTutorial.title,
          stepTitle: 'Open database sources',
          stepNumber: 1,
          totalSteps: 2,
          content: [{ kind: 'text' as const, text: 'Open the database sources page.' }],
          targetAccessibleName: 'Databases',
          previousEnabled: false,
          forwardLabel: 'Next' as const,
          forwardEnabled: true,
          selectedLocale: 'en' as const,
          fallbackLocale: null,
        },
        destinationHref: '/catalog/databases',
        targetSelector: '[data-tutorial-target="catalog-databases"]',
        requiredActionId: null,
      },
    ],
  ]),
  steps: [
    {
      id: 'step-open-databases',
      order: 1,
      title: 'Open database sources',
      instructionalContent: 'Open the database sources page.',
      destinationFeature: 'CATALOG' as const,
      destinationHref: '/catalog/databases',
      targetControl: {
        id: 'catalog-databases',
        accessibleName: 'Databases',
        selector: '[data-tutorial-target="catalog-databases"]',
      },
    },
    {
      id: 'step-review-database',
      order: 2,
      title: 'Review a source',
      instructionalContent: 'Review the selected source.',
      destinationFeature: 'CATALOG' as const,
      destinationHref: '/catalog/databases',
    },
  ],
  completionSummary: {
    tutorialId: catalogTutorial.id,
    runId: `${startedRun.tutorialId}:${startedRun.updatedAt}`,
    title: catalogTutorial.title,
    completedAt: startedRun.updatedAt,
    learningOutcomes: [...catalogTutorial.learningOutcomes],
    nextRecommendation: null,
    selectedLocale: 'en' as const,
    fallbackLocale: null,
  },
};

let originalPath = '/';

function resetTutorialSession(): void {
  useTutorialSessionStore.setState({
    openSurface: 'none',
    activeRunId: null,
    catalogView: { search: '', filters: [], scrollTop: 0 },
  });
}

async function openDetailFromCatalog(): Promise<void> {
  render(createElement(TutorialOverlayHost));
  act(() => {
    useTutorialSessionStore.getState().setOpenSurface('catalog');
  });

  fireEvent.click(await screen.findByRole('button', { name: 'View tutorial details' }));
  await screen.findByRole('heading', { name: catalogTutorial.title, level: 2 });
}

async function chooseContextAndStart(): Promise<void> {
  fireEvent.change(await screen.findByRole('combobox', { name: 'Choose DATABASE_SERVICE' }), {
    target: { value: 'service-1' },
  });

  const start = await screen.findByRole('button', { name: 'Start tutorial' });
  await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(start);
}

beforeEach(() => {
  originalPath = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', '/home');
  router.push.mockClear();

  controllerMocks.listCatalog.mockReset().mockResolvedValue({
    tutorials: [catalogTutorial],
    noResults: false,
  });
  controllerMocks.openDetail
    .mockReset()
    .mockImplementation(async (input: { contextSelections: readonly unknown[] }) =>
      input.contextSelections.length === 0 ? baseDetail : selectedDetail,
    );
  controllerMocks.openWalkthrough.mockReset().mockResolvedValue(activeWalkthrough);
  controllerMocks.repeatTutorial.mockReset().mockImplementation(async ({ progress }) => ({
    outcome: 'REPEATED' as const,
    run: {
      ...progress,
      status: 'IN_PROGRESS' as const,
      currentStepId: 'step-open-databases',
      completedStepIds: [],
      updatedAt: '2026-03-04T05:08:00.000Z',
    },
    destinationHref: '/catalog/databases',
  }));
  controllerMocks.startRun.mockReset().mockResolvedValue(started);
  controllerMocks.resumeRun.mockReset();
  controllerMocks.loadSession.mockReset().mockResolvedValue({
    identityId: 'identity-1',
    identityTenantId: 'tenant-1',
    mfaVerified: true,
    organization: {
      organizationId: 'organization-1',
      organizationName: 'Celesnity',
      homeRegion: 'eu-west-1',
      mfaRequired: false,
      role: 'DATA_ENGINEER',
    },
    visibleFeatures: null,
  });
  controllerMocks.resolveOnboarding.mockReset().mockResolvedValue({
    outcome: 'NOT_PRESENTED',
    invitationVisible: false,
  });
  resetTutorialSession();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', originalPath);
  useLocaleStore.setState({ locale: defaultLocale });
  resetTutorialSession();
});

describe('integrated tutorial journey', () => {
  it('opens the selected tutorial through the detail controller and returns to the catalog', async () => {
    await openDetailFromCatalog();

    expect(controllerMocks.openDetail).toHaveBeenCalledWith({
      tutorialId: catalogTutorial.id,
      prerequisiteEvaluations: [],
      contextSelections: [],
    });
    expect(screen.getByRole('complementary', { name: 'Tutorial details' })).toBeTruthy();
    expect(screen.getByText(catalogTutorial.summary)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Choose DATABASE_SERVICE' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to tutorial catalog' }));

    expect(useTutorialSessionStore.getState().openSurface).toBe('catalog');
    expect(
      await screen.findByRole('heading', { name: catalogTutorial.title, level: 3 }),
    ).toBeTruthy();
  });

  it('re-resolves eligibility through the controller when a context selection changes', async () => {
    await openDetailFromCatalog();

    expect(
      (screen.getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.change(screen.getByRole('combobox', { name: 'Choose DATABASE_SERVICE' }), {
      target: { value: 'service-1' },
    });

    await waitFor(() =>
      expect(controllerMocks.openDetail).toHaveBeenLastCalledWith({
        tutorialId: catalogTutorial.id,
        prerequisiteEvaluations: [],
        contextSelections: [chosenSelection],
      }),
    );
    // startEnabled stayed a use-case decision: the panel only reflects it.
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(screen.getByText('Selected: analytics-primary')).toBeTruthy();
  });

  it('starts the run, navigates with the router, and opens the walkthrough only once the destination is ready', async () => {
    await openDetailFromCatalog();
    await chooseContextAndStart();

    await waitFor(() =>
      expect(controllerMocks.startRun).toHaveBeenCalledWith({
        tutorialId: catalogTutorial.id,
        memberId: 'identity-1',
        organizationId: 'organization-1',
        contextSelections: [chosenSelection],
      }),
    );
    expect(controllerMocks.startRun).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/catalog/databases'));
    expect(window.location.pathname).toBe('/catalog/databases');

    const walkthrough = await screen.findByRole('complementary', { name: 'Tutorial walkthrough' });
    expect(walkthrough.getAttribute('data-tutorial-surface')).toBe('walkthrough');
    expect(controllerMocks.openWalkthrough).toHaveBeenCalledWith({
      runId: `${startedRun.tutorialId}:${startedRun.updatedAt}`,
      progress: startedRun,
      locale: 'en',
    });
    expect(await screen.findByText('Open database sources')).toBeTruthy();
  });

  it('restores paused progress through the resume lifecycle instead of restarting it', async () => {
    const pausedProgress: TutorialProgressViewModel = {
      ...startedRun,
      status: 'PAUSED',
      contextSelections: [chosenSelection],
    };
    const resumedProgress: TutorialProgressViewModel = {
      ...pausedProgress,
      status: 'IN_PROGRESS',
      updatedAt: '2026-03-04T05:07:00.000Z',
    };
    controllerMocks.openDetail.mockResolvedValue({
      ...selectedDetail,
      progress: pausedProgress,
    });
    controllerMocks.resumeRun.mockImplementation(async (input: { destinationReady: boolean }) =>
      input.destinationReady
        ? {
            outcome: 'RESUMED',
            progress: resumedProgress,
            destinationHref: '/catalog/databases',
          }
        : {
            outcome: 'BLOCKED',
            progress: pausedProgress,
            destinationHref: '/catalog/databases',
            blockers: {
              blockingFeatureIds: [],
              unsatisfiedPrerequisiteIds: [],
              replacementRequiredRequirementIds: [],
              destinationNotReady: true,
            },
          },
    );
    controllerMocks.openWalkthrough.mockResolvedValue({
      ...activeWalkthrough,
      runId: `${resumedProgress.tutorialId}:${resumedProgress.updatedAt}`,
      progress: resumedProgress,
    });

    await openDetailFromCatalog();
    fireEvent.click(await screen.findByRole('button', { name: 'Resume tutorial' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/catalog/databases'));
    await waitFor(() => expect(controllerMocks.resumeRun).toHaveBeenCalledTimes(2));
    expect(controllerMocks.resumeRun.mock.calls[0]?.[0]).toMatchObject({
      progress: pausedProgress,
      destinationReady: false,
    });
    expect(controllerMocks.resumeRun.mock.calls[1]?.[0]).toMatchObject({
      progress: pausedProgress,
      destinationReady: true,
    });
    expect(controllerMocks.startRun).not.toHaveBeenCalled();
    expect(controllerMocks.openWalkthrough).toHaveBeenCalledWith({
      runId: `${resumedProgress.tutorialId}:${resumedProgress.updatedAt}`,
      progress: resumedProgress,
      locale: 'en',
    });
    expect(await screen.findByText('Open database sources')).toBeTruthy();
  });

  it('confirms and starts a fresh run for completed tutorial progress', async () => {
    const completedProgress: TutorialProgressViewModel = {
      ...startedRun,
      status: 'COMPLETED',
      currentStepId: 'step-review-database',
      completedStepIds: ['step-open-databases', 'step-review-database'],
    };
    controllerMocks.openDetail.mockResolvedValue({
      ...selectedDetail,
      progress: completedProgress,
    });

    await openDetailFromCatalog();
    fireEvent.click(await screen.findByRole('button', { name: 'Repeat tutorial' }));

    const confirmation = await screen.findByRole('alertdialog');
    expect(
      within(confirmation).getByRole('heading', {
        name: 'Start this tutorial from the beginning?',
      }),
    ).toBeTruthy();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start fresh' }));

    await waitFor(() =>
      expect(controllerMocks.startRun).toHaveBeenCalledWith({
        tutorialId: catalogTutorial.id,
        memberId: 'identity-1',
        organizationId: 'organization-1',
        contextSelections: [chosenSelection],
      }),
    );
    expect(controllerMocks.repeatTutorial).not.toHaveBeenCalled();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/catalog/databases'));
  });

  it('resolves an active-run conflict when repeating a completed tutorial', async () => {
    const completedProgress: TutorialProgressViewModel = {
      ...startedRun,
      status: 'COMPLETED',
      currentStepId: 'step-review-database',
      completedStepIds: ['step-open-databases', 'step-review-database'],
    };
    controllerMocks.openDetail.mockResolvedValue({
      ...selectedDetail,
      experience: {
        mode: 'SIMULATED_CHAT',
        scenarioId: 'agent-create-artifacts',
        scenarioVersion: 1,
        resumePolicy: 'RESTART',
      },
      progress: completedProgress,
    });
    controllerMocks.startRun.mockResolvedValueOnce({
      outcome: 'CONFLICT_REQUIRES_CHOICE',
      activeRun: { ...startedRun, tutorialId: 'other-tutorial' },
      choices: ['PAUSE_ACTIVE', 'CANCEL_NEW_START'],
    });

    await openDetailFromCatalog();
    fireEvent.click(await screen.findByRole('button', { name: 'Repeat tutorial' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Start fresh',
      }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Another tutorial is in progress' }),
    ).toBeTruthy();
    expect(controllerMocks.repeatTutorial).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Pause current tutorial and start this one' }),
    );

    await waitFor(() =>
      expect(controllerMocks.startRun).toHaveBeenLastCalledWith({
        tutorialId: catalogTutorial.id,
        memberId: 'identity-1',
        organizationId: 'organization-1',
        contextSelections: [chosenSelection],
        conflictResolution: 'PAUSE_ACTIVE',
      }),
    );
  });

  it('can discard paused progress and start the same tutorial from step one', async () => {
    const pausedProgress: TutorialProgressViewModel = {
      ...startedRun,
      status: 'PAUSED',
      currentStepId: 'step-review-database',
      completedStepIds: ['step-open-databases'],
    };
    controllerMocks.openDetail.mockResolvedValue({
      ...selectedDetail,
      progress: pausedProgress,
    });

    await openDetailFromCatalog();
    expect(screen.getByRole('button', { name: 'Resume tutorial' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start fresh' }));

    const confirmation = await screen.findByRole('alertdialog');
    expect(within(confirmation).getByText(/databases, connections, crawlers/i)).toBeTruthy();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start fresh' }));

    await waitFor(() => expect(controllerMocks.startRun).toHaveBeenCalledTimes(1));
    expect(controllerMocks.repeatTutorial).not.toHaveBeenCalled();
    expect(controllerMocks.resumeRun).not.toHaveBeenCalled();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/catalog/databases'));
  });

  it('keeps the walkthrough closed and explains a cancelled start', async () => {
    controllerMocks.startRun.mockResolvedValue({
      outcome: 'CANCELLED',
      activeRun: { ...startedRun, tutorialId: 'other-tutorial' },
    });

    await openDetailFromCatalog();
    await chooseContextAndStart();

    expect(
      await screen.findByText('Your current tutorial was kept, so this tutorial did not start.'),
    ).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Tutorial walkthrough' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back to tutorial catalog' }));
    expect(useTutorialSessionStore.getState().openSurface).toBe('catalog');
  });

  it('explains a failed pause of the active run without starting the new one', async () => {
    controllerMocks.startRun.mockResolvedValue({
      outcome: 'PAUSE_FAILED',
      activeRun: { ...startedRun, tutorialId: 'other-tutorial' },
    });

    await openDetailFromCatalog();
    await chooseContextAndStart();

    expect(
      await screen.findByText(
        'Your current tutorial could not be paused, so this tutorial did not start.',
      ),
    ).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('asks the member to resolve an active-run conflict before starting', async () => {
    controllerMocks.startRun.mockResolvedValueOnce({
      outcome: 'CONFLICT_REQUIRES_CHOICE',
      activeRun: { ...startedRun, tutorialId: 'other-tutorial' },
      choices: ['PAUSE_ACTIVE', 'CANCEL_NEW_START'],
    });

    await openDetailFromCatalog();
    await chooseContextAndStart();

    expect(
      await screen.findByRole('heading', { name: 'Another tutorial is in progress' }),
    ).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Pause current tutorial and start this one' }),
    );

    await waitFor(() =>
      expect(controllerMocks.startRun).toHaveBeenLastCalledWith({
        tutorialId: catalogTutorial.id,
        memberId: 'identity-1',
        organizationId: 'organization-1',
        contextSelections: [chosenSelection],
        conflictResolution: 'PAUSE_ACTIVE',
      }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/catalog/databases'));
  });

  it('reports a detail load failure without leaving the surface empty', async () => {
    controllerMocks.openDetail.mockRejectedValue(new Error('unavailable'));

    render(createElement(TutorialOverlayHost));
    act(() => {
      useTutorialSessionStore.getState().setOpenSurface('catalog');
    });
    fireEvent.click(await screen.findByRole('button', { name: 'View tutorial details' }));

    expect(await screen.findByText('Tutorial details could not be loaded.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to tutorial catalog' })).toBeTruthy();
  });
});
