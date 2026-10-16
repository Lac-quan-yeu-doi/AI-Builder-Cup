// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CompletionSummary,
  type CompletionSummaryProps,
} from '@/app/_components/tutorials/completion-summary';
import { defaultLocale } from '@/app/_i18n/locales';
import { useLocaleStore } from '@/app/_stores/locale.store';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import type { RepeatTutorialController } from '@/src/interface-adapters/controllers/tutorials/repeat-tutorial.controller';
import type { CompletionSummaryViewModel } from '@/src/interface-adapters/presenters/completion.presenter';
import type { TutorialProgressViewModel } from '@/src/interface-adapters/presenters/tutorial-run.presenter';
import { renderUi } from '@/tests/support/render-ui';

const summary: CompletionSummaryViewModel = {
  title: 'Build your first streaming pipeline',
  outcomes: ['Selected an authorized source', 'Published a working pipeline'],
  completedAt: '2025-01-15T14:30:00.000Z',
  nextRecommendation: {
    tutorialId: 'monitor-pipeline',
    title: 'Monitor pipeline health',
  },
  selectedLocale: 'en',
  fallbackLocale: null,
};

const completedProgress: TutorialProgressViewModel = {
  tutorialId: 'build-pipeline',
  memberId: 'member-1',
  organizationId: 'organization-1',
  status: 'COMPLETED',
  currentStepId: 'publish-pipeline',
  completedStepIds: ['select-source', 'publish-pipeline'],
  contextSelections: [
    {
      requirementId: 'source',
      resourceType: 'CONNECTION',
      resourceId: 'connection-1',
    },
  ],
  updatedAt: '2025-01-15T14:30:00.000Z',
};

const repeatedProgress: TutorialProgressViewModel = {
  ...completedProgress,
  status: 'IN_PROGRESS',
  currentStepId: 'select-source',
  completedStepIds: [],
  updatedAt: '2025-01-15T14:31:00.000Z',
};

function createProps(
  repeatTutorial: RepeatTutorialController,
  overrides: Partial<CompletionSummaryProps> = {},
): CompletionSummaryProps {
  return {
    summary,
    progress: completedProgress,
    repeatTutorial,
    onOpenNextTutorial: vi.fn(),
    onRepeatStarted: vi.fn(),
    onReturnToWorkspace: vi.fn(),
    ...overrides,
  };
}

function resetTutorialSession(): void {
  useTutorialSessionStore.setState({
    openSurface: 'walkthrough',
    activeRunId: null,
    catalogView: { search: '', filters: [], scrollTop: 0 },
  });
}

afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: defaultLocale });
  resetTutorialSession();
});

describe('CompletionSummary', () => {
  it('shows the completed tutorial, every outcome, timestamp, and next recommendation', () => {
    const repeatTutorial = vi.fn<RepeatTutorialController>();
    renderUi(createElement(CompletionSummary, createProps(repeatTutorial)));

    expect(screen.getByRole('region', { name: 'Tutorial completion summary' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Tutorial complete' })).toBeDefined();
    expect(screen.getByRole('heading', { name: summary.title })).toBeDefined();
    expect(screen.getByText('Selected an authorized source')).toBeDefined();
    expect(screen.getByText('Published a working pipeline')).toBeDefined();

    const formattedTimestamp = new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(summary.completedAt));
    const timestamp = screen.getByText(`Completed ${formattedTimestamp}`);
    expect(timestamp.tagName).toBe('TIME');
    expect(timestamp.getAttribute('datetime')).toBe(summary.completedAt);

    expect(screen.getByText(summary.nextRecommendation?.title ?? '')).toBeDefined();
    expect(screen.getByRole('button', { name: 'View next tutorial' })).toBeDefined();
  });

  it('returns to the Workspace or opens the recommended tutorial through host callbacks and store state', () => {
    const repeatTutorial = vi.fn<RepeatTutorialController>();
    const onOpenNextTutorial = vi.fn();
    const onReturnToWorkspace = vi.fn();
    renderUi(
      createElement(
        CompletionSummary,
        createProps(repeatTutorial, { onOpenNextTutorial, onReturnToWorkspace }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'View next tutorial' }));
    expect(onOpenNextTutorial).toHaveBeenCalledWith('monitor-pipeline');
    expect(useTutorialSessionStore.getState().openSurface).toBe('detail');

    fireEvent.click(screen.getByRole('button', { name: 'Return to workspace' }));
    expect(onReturnToWorkspace).toHaveBeenCalledOnce();
    expect(useTutorialSessionStore.getState().openSurface).toBe('none');
  });

  it('requests confirmation and preserves completion when repetition is declined', async () => {
    const repeatTutorial = vi.fn<RepeatTutorialController>();
    repeatTutorial.mockImplementation(async (input) =>
      input.confirmed === false
        ? { outcome: 'DECLINED', progress: completedProgress }
        : { outcome: 'CONFIRMATION_REQUIRED', progress: completedProgress },
    );
    const onRepeatStarted = vi.fn();
    renderUi(createElement(CompletionSummary, createProps(repeatTutorial, { onRepeatStarted })));

    fireEvent.click(screen.getByRole('button', { name: 'Repeat tutorial' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Repeat this tutorial?')).toBeDefined();
    expect(repeatTutorial).toHaveBeenNthCalledWith(1, {
      progress: {
        ...completedProgress,
        completedStepIds: [...completedProgress.completedStepIds],
        contextSelections: completedProgress.contextSelections.map((selection) => ({
          ...selection,
        })),
      },
    });
    expect(onRepeatStarted).not.toHaveBeenCalled();
    expect(useTutorialSessionStore.getState().openSurface).toBe('walkthrough');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep completion' }));

    await waitFor(() => {
      expect(repeatTutorial).toHaveBeenNthCalledWith(2, {
        progress: {
          ...completedProgress,
          completedStepIds: [...completedProgress.completedStepIds],
          contextSelections: completedProgress.contextSelections.map((selection) => ({
            ...selection,
          })),
        },
        confirmed: false,
      });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(onRepeatStarted).not.toHaveBeenCalled();
    expect(useTutorialSessionStore.getState().openSurface).toBe('walkthrough');
  });

  it('starts a fresh run only after confirmation and reports confirmation failures inside the dialog', async () => {
    const repeatedResult = {
      outcome: 'REPEATED',
      run: repeatedProgress,
      destinationHref: '/streaming/pipelines',
    } as const;
    const repeatTutorial = vi.fn<RepeatTutorialController>();
    repeatTutorial
      .mockResolvedValueOnce({
        outcome: 'CONFIRMATION_REQUIRED',
        progress: completedProgress,
      })
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce(repeatedResult);
    const onRepeatStarted = vi.fn();
    renderUi(createElement(CompletionSummary, createProps(repeatTutorial, { onRepeatStarted })));

    fireEvent.click(screen.getByRole('button', { name: 'Repeat tutorial' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Repeat tutorial' }));

    const failure = await within(dialog).findByRole('alert');
    expect(failure.textContent).toBe(
      'Your latest tutorial progress could not be saved. Your last saved progress is unchanged.',
    );
    expect(screen.getByRole('alertdialog')).toBeDefined();
    expect(onRepeatStarted).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Repeat tutorial' }));

    await waitFor(() => {
      expect(onRepeatStarted).toHaveBeenCalledWith(repeatedResult);
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(repeatTutorial).toHaveBeenLastCalledWith({
      progress: {
        ...completedProgress,
        completedStepIds: [...completedProgress.completedStepIds],
        contextSelections: completedProgress.contextSelections.map((selection) => ({
          ...selection,
        })),
      },
      confirmed: true,
    });
    expect(useTutorialSessionStore.getState().openSurface).toBe('walkthrough');
  });
});
