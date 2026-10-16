// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({
  listCatalog: vi.fn(),
  openDetail: vi.fn(),
  recordOnboardingDecision: vi.fn(),
  resolveOnboarding: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/di/container', () => ({
  getInjection: vi.fn((token: string) => {
    switch (token) {
      case 'ListTutorialCatalogController':
        return controllerMocks.listCatalog;
      case 'OpenTutorialDetailController':
        return controllerMocks.openDetail;
      case 'RecordOnboardingDecisionController':
        return controllerMocks.recordOnboardingDecision;
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
import type { RecordedOnboardingDecisionViewModel } from '@/src/interface-adapters/presenters/onboarding.presenter';
import { renderUi as render } from '@/tests/support/render-ui';

const recommendation = {
  id: 'starter-databases',
  title: 'Explore a database',
  summary: 'Learn how to inspect database services and their catalogs.',
  category: 'Databases',
  learningOutcomes: ['Find a database service'],
  estimatedMinutes: 5,
  stepCount: 3,
} as const;

const catalogTutorial = {
  ...recommendation,
  status: 'NOT_STARTED',
} as const;

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value) => {
      if (resolvePromise === undefined) {
        throw new Error('Deferred promise was not initialized.');
      }
      resolvePromise(value);
    },
  };
}

function resetTutorialSession(): void {
  useTutorialSessionStore.setState({
    openSurface: 'none',
    activeRunId: null,
    catalogView: { search: '', filters: [], scrollTop: 0 },
  });
}

beforeEach(() => {
  controllerMocks.listCatalog.mockReset();
  controllerMocks.openDetail.mockReset();
  controllerMocks.recordOnboardingDecision.mockReset();
  controllerMocks.resolveOnboarding.mockReset();

  controllerMocks.listCatalog.mockResolvedValue({
    tutorials: [catalogTutorial],
    noResults: false,
  });
  controllerMocks.openDetail.mockResolvedValue({
    tutorialId: recommendation.id,
    experience: { mode: 'WORKSPACE' },
    metadata: {
      title: recommendation.title,
      summary: recommendation.summary,
      category: recommendation.category,
      learningOutcomes: [...recommendation.learningOutcomes],
      estimatedMinutes: recommendation.estimatedMinutes,
      stepCount: recommendation.stepCount,
    },
    prerequisiteStates: [],
    contextSelectors: [],
    startEnabled: true,
  });
  controllerMocks.resolveOnboarding.mockResolvedValue({
    outcome: 'RECOMMENDATION_AVAILABLE',
    invitationVisible: true,
    recommendation,
  });
  resetTutorialSession();
});

afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: defaultLocale });
  resetTutorialSession();
});

describe('tutorial onboarding flow', () => {
  it('keeps the Workspace operable and opens detail only after acceptance persists', async () => {
    const decision = deferred<RecordedOnboardingDecisionViewModel>();
    controllerMocks.recordOnboardingDecision.mockReturnValue(decision.promise);

    render(
      createElement(
        'main',
        null,
        createElement('label', { htmlFor: 'workspace-draft' }, 'Workspace draft'),
        createElement('input', { id: 'workspace-draft' }),
        createElement(TutorialOverlayHost),
      ),
    );

    await screen.findByRole('complementary', { name: 'Learn the workspace as you go' });

    const workspaceDraft = screen.getByRole('textbox', {
      name: 'Workspace draft',
    }) as HTMLInputElement;
    fireEvent.change(workspaceDraft, { target: { value: 'work remains editable' } });
    expect(workspaceDraft.value).toBe('work remains editable');

    fireEvent.click(screen.getByRole('button', { name: 'View recommended tutorial' }));

    expect(controllerMocks.recordOnboardingDecision).toHaveBeenCalledWith({
      decision: 'accepted',
      tutorialId: recommendation.id,
    });
    expect(useTutorialSessionStore.getState().openSurface).toBe('onboarding');
    expect(screen.queryByRole('complementary', { name: 'Tutorial details' })).toBeNull();

    decision.resolve({
      outcome: 'OPEN_TUTORIAL_DETAIL',
      invitationVisible: false,
      tutorialId: recommendation.id,
    });

    await waitFor(() => {
      expect(useTutorialSessionStore.getState().openSurface).toBe('detail');
    });
    expect(screen.getByRole('complementary', { name: 'Tutorial details' })).toBeTruthy();
  });

  it('closes only after dismissal persists and keeps the starter discoverable', async () => {
    const decision = deferred<RecordedOnboardingDecisionViewModel>();
    controllerMocks.recordOnboardingDecision.mockReturnValue(decision.promise);

    render(createElement(TutorialOverlayHost));

    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));

    expect(controllerMocks.recordOnboardingDecision).toHaveBeenCalledWith({
      decision: 'dismissed',
    });
    expect(useTutorialSessionStore.getState().openSurface).toBe('onboarding');
    expect(
      screen.getByRole('complementary', { name: 'Learn the workspace as you go' }),
    ).toBeTruthy();

    decision.resolve({
      outcome: 'INVITATION_CLOSED',
      invitationVisible: false,
    });

    await waitFor(() => {
      expect(useTutorialSessionStore.getState().openSurface).toBe('none');
      expect(screen.queryByRole('complementary')).toBeNull();
    });

    act(() => {
      useTutorialSessionStore.getState().setOpenSurface('catalog');
    });

    expect(await screen.findByRole('heading', { name: recommendation.title })).toBeTruthy();
    expect(controllerMocks.listCatalog).toHaveBeenCalledWith({
      searchTerm: '',
      statusFilters: [],
    });
  });
});
