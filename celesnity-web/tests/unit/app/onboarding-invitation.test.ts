// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OnboardingInvitation,
  type OnboardingInvitationControllers,
} from '@/app/_components/tutorials/onboarding-invitation';
import { defaultLocale } from '@/app/_i18n/locales';
import { useLocaleStore } from '@/app/_stores/locale.store';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import type {
  RecordedOnboardingDecisionViewModel,
  ResolvedOnboardingViewModel,
} from '@/src/interface-adapters/presenters/onboarding.presenter';
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

function createControllers(
  resolved: ResolvedOnboardingViewModel,
  recorded: RecordedOnboardingDecisionViewModel,
): {
  readonly controllers: OnboardingInvitationControllers;
  readonly recordOnboardingDecision: ReturnType<typeof vi.fn>;
} {
  const resolveOnboarding = vi.fn<OnboardingInvitationControllers['resolveOnboarding']>();
  resolveOnboarding.mockResolvedValue(resolved);
  const recordOnboardingDecision =
    vi.fn<OnboardingInvitationControllers['recordOnboardingDecision']>();
  recordOnboardingDecision.mockResolvedValue(recorded);

  return {
    controllers: { resolveOnboarding, recordOnboardingDecision },
    recordOnboardingDecision,
  };
}

function resetTutorialSession(): void {
  useTutorialSessionStore.setState({
    openSurface: 'none',
    activeRunId: null,
    catalogView: { search: '', filters: [], scrollTop: 0 },
  });
}

afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: defaultLocale });
  resetTutorialSession();
});

describe('OnboardingInvitation', () => {
  it('renders an accessible recommendation without blocking Workspace interaction', async () => {
    const { controllers, recordOnboardingDecision } = createControllers(
      {
        outcome: 'RECOMMENDATION_AVAILABLE',
        invitationVisible: true,
        recommendation,
      },
      { outcome: 'INVITATION_CLOSED', invitationVisible: false },
    );

    render(
      createElement(
        'main',
        null,
        createElement('label', { htmlFor: 'workspace-draft' }, 'Workspace draft'),
        createElement('input', { id: 'workspace-draft' }),
        createElement(OnboardingInvitation, {
          controllers,
          onOpenTutorialDetail: vi.fn(),
        }),
      ),
    );

    const invitation = await screen.findByRole('complementary', {
      name: 'Learn the workspace as you go',
    });
    expect(invitation.getAttribute('aria-modal')).toBeNull();
    expect(screen.getByText(recommendation.title)).toBeTruthy();
    expect(screen.getByText(recommendation.summary)).toBeTruthy();
    expect(screen.getByText('5 minutes')).toBeTruthy();
    expect(screen.getByText('3 steps')).toBeTruthy();
    expect(useTutorialSessionStore.getState().openSurface).toBe('onboarding');

    const workspaceDraft = screen.getByRole('textbox', {
      name: 'Workspace draft',
    }) as HTMLInputElement;
    fireEvent.change(workspaceDraft, { target: { value: 'work remains editable' } });
    expect(workspaceDraft.value).toBe('work remains editable');
    expect(recordOnboardingDecision).not.toHaveBeenCalled();
  });

  it('shows the no-starter state with a usable dismissal action', async () => {
    const { controllers, recordOnboardingDecision } = createControllers(
      {
        outcome: 'NO_STARTER_AVAILABLE',
        invitationVisible: true,
        dismissalAvailable: true,
      },
      { outcome: 'INVITATION_CLOSED', invitationVisible: false },
    );

    render(
      createElement(OnboardingInvitation, {
        controllers,
        onOpenTutorialDetail: vi.fn(),
      }),
    );

    expect(await screen.findByText('No starter tutorial is available')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'View recommended tutorial' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss onboarding' }));

    await waitFor(() => {
      expect(recordOnboardingDecision).toHaveBeenCalledWith({ decision: 'dismissed' });
      expect(useTutorialSessionStore.getState().openSurface).toBe('none');
    });
    expect(screen.queryByText('No starter tutorial is available')).toBeNull();
  });

  it('retains the invitation and explains a persistence failure', async () => {
    const { controllers } = createControllers(
      {
        outcome: 'RECOMMENDATION_AVAILABLE',
        invitationVisible: true,
        recommendation,
      },
      {
        outcome: 'PERSISTENCE_FAILED',
        invitationVisible: true,
        failureExplanation:
          'The onboarding choice could not be saved. The invitation remains open.',
      },
    );

    render(
      createElement(OnboardingInvitation, {
        controllers,
        onOpenTutorialDetail: vi.fn(),
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));

    const persistenceAlert = await screen.findByRole('alert');
    expect(persistenceAlert.textContent).toBe(
      'Your onboarding choice could not be saved. The invitation remains open.',
    );
    expect(screen.getByText(recommendation.title)).toBeTruthy();
    expect(useTutorialSessionStore.getState().openSurface).toBe('onboarding');
  });
});
