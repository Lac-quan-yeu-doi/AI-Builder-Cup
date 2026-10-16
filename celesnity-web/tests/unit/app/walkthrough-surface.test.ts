// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { observeRunQueryRequiredAction } from '@/app/_components/shared/workspace-required-actions';
import {
  WalkthroughSurface,
  type ActiveWalkthrough,
  type WalkthroughStepView,
  type WalkthroughSurfaceControllers,
} from '@/app/_components/tutorials/walkthrough-surface';
import { defaultLocale } from '@/app/_i18n/locales';
import { useLocaleStore } from '@/app/_stores/locale.store';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import type { PauseTutorialRunInput } from '@/src/interface-adapters/controllers/tutorials/tutorial.schemas';
import type { CompletionSummaryViewModel } from '@/src/interface-adapters/presenters/completion.presenter';
import type { TutorialProgressViewModel } from '@/src/interface-adapters/presenters/tutorial-run.presenter';
import { renderUi as render } from '@/tests/support/render-ui';

const DESTINATION = '/catalog/databases';
const RUN_ID = 'run-1';
const TUTORIAL_ID = 'tutorial-connections';

const controllerMocks = {
  advanceStep: vi.fn(),
  pauseRun: vi.fn(),
  completeRun: vi.fn(),
  repeatTutorial: vi.fn(),
};

const controllers = controllerMocks as unknown as WalkthroughSurfaceControllers;

function progressAt(
  currentStepId: string,
  overrides: Partial<TutorialProgressViewModel> = {},
): TutorialProgressViewModel {
  return {
    tutorialId: TUTORIAL_ID,
    memberId: 'identity-1',
    organizationId: 'organization-1',
    status: 'IN_PROGRESS',
    currentStepId,
    completedStepIds: [],
    contextSelections: [],
    updatedAt: '2026-03-04T05:06:07.000Z',
    ...overrides,
  };
}

const steps: readonly PauseTutorialRunInput['steps'][number][] = [
  {
    id: 'step-open',
    order: 1,
    title: 'Open Databases',
    instructionalContent: 'Open Databases from the workspace rail.',
    destinationFeature: 'CATALOG_DATABASES',
    destinationHref: DESTINATION,
    targetControl: {
      id: 'nav-databases',
      accessibleName: 'Databases',
      selector: '#nav-databases',
    },
  },
  {
    id: 'step-run-query',
    order: 2,
    title: 'Run a query',
    instructionalContent: 'Run the prepared statement.',
    destinationFeature: 'CATALOG_DATABASES',
    destinationHref: DESTINATION,
    requiredAction: { id: 'run-query', accessibleName: 'Run query' },
  },
];

const openStepView: WalkthroughStepView = {
  step: {
    tutorialTitle: 'Connect a database',
    stepTitle: 'Open Databases',
    stepNumber: 1,
    totalSteps: 2,
    content: [{ kind: 'text', text: 'Open Databases from the workspace rail.' }],
    targetAccessibleName: 'Databases',
    previousEnabled: false,
    forwardLabel: 'Next',
    forwardEnabled: true,
    selectedLocale: 'en',
    fallbackLocale: null,
  },
  destinationHref: DESTINATION,
  targetSelector: '#nav-databases',
  requiredActionId: null,
};

const queryStepView: WalkthroughStepView = {
  step: {
    tutorialTitle: 'Connect a database',
    stepTitle: 'Run a query',
    stepNumber: 2,
    totalSteps: 2,
    content: [{ kind: 'action-callout', text: 'Run the prepared statement.' }],
    previousEnabled: true,
    forwardLabel: 'Finish',
    forwardEnabled: true,
    selectedLocale: 'en',
    fallbackLocale: null,
  },
  destinationHref: DESTINATION,
  targetSelector: null,
  requiredActionId: 'run-query',
};

const completionSummary: CompletionSummaryViewModel = {
  title: 'Connect a database',
  outcomes: ['Register a source'],
  completedAt: '2026-03-04T06:00:00.000Z',
  nextRecommendation: { tutorialId: 'tutorial-query', title: 'Run your first SQL query' },
  selectedLocale: 'en',
  fallbackLocale: null,
};

function walkthroughAt(currentStepId: string): ActiveWalkthrough {
  return {
    runId: RUN_ID,
    tutorialId: TUTORIAL_ID,
    experience: { mode: 'WORKSPACE' },
    progress: progressAt(currentStepId),
    stepViews: new Map([
      ['step-open', openStepView],
      ['step-run-query', queryStepView],
    ]),
    steps,
    completionSummary,
  };
}

function renderSurface(
  walkthrough: ActiveWalkthrough | null,
  overrides: {
    readonly onClose?: () => void;
    readonly onOpenTutorialDetail?: (tutorialId: string) => void;
    readonly onRepeatStarted?: (destinationHref: string) => void;
  } = {},
) {
  return render(
    createElement(WalkthroughSurface, {
      controllers,
      onClose: overrides.onClose ?? vi.fn(),
      onOpenTutorialDetail: overrides.onOpenTutorialDetail ?? vi.fn(),
      onRepeatStarted: overrides.onRepeatStarted,
      walkthrough,
    }),
  );
}

/**
 * Navigation stays blocked until the destination reports ready, so every
 * interaction waits for the control the walkthrough actually offers.
 */
async function clickWhenEnabled(name: string): Promise<void> {
  const control = await screen.findByRole('button', { name });
  await waitFor(() => expect((control as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(control);
}

let originalPath = '/';

beforeEach(() => {
  originalPath = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', DESTINATION);

  const target = document.createElement('a');
  target.id = 'nav-databases';
  target.href = DESTINATION;
  target.textContent = 'Databases';
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
    top: 100,
    left: 40,
    width: 120,
    height: 32,
    right: 160,
    bottom: 132,
    x: 40,
    y: 100,
    toJSON: () => ({}),
  });
  document.body.append(target);

  controllerMocks.advanceStep.mockReset();
  controllerMocks.pauseRun.mockReset();
  controllerMocks.completeRun.mockReset();
  controllerMocks.repeatTutorial.mockReset();
  useTutorialSessionStore.setState({ openSurface: 'walkthrough', activeRunId: null });
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  window.history.replaceState(null, '', originalPath);
  useLocaleStore.setState({ locale: defaultLocale });
  useTutorialSessionStore.setState({ openSurface: 'none', activeRunId: null });
  vi.restoreAllMocks();
});

describe('WalkthroughSurface', () => {
  it('renders the current step with its spotlight and records the active run', async () => {
    const { container } = renderSurface(walkthroughAt('step-open'));

    expect(await screen.findByRole('heading', { name: 'Open Databases' })).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
    expect(screen.getByText('Open Databases. Step 1 of 2.')).toBeTruthy();
    expect(useTutorialSessionStore.getState().activeRunId).toBe(RUN_ID);

    await waitFor(() =>
      expect(container.querySelector('[data-spotlight-cutout="target"]')?.getAttribute('x')).toBe(
        '36',
      ),
    );
    expect(screen.getByRole('button', { name: 'Move to highlighted control' })).toBeTruthy();
  });

  it('advances forward and back through the advance controller and renders the resolved step', async () => {
    controllerMocks.advanceStep.mockResolvedValueOnce({
      ok: true,
      runId: RUN_ID,
      transition: 'NEXT',
      progress: progressAt('step-run-query', { completedStepIds: ['step-open'] }),
    });
    renderSurface(walkthroughAt('step-open'));

    await screen.findByRole('heading', { name: 'Open Databases' });
    const next = screen.getByRole('button', { name: 'Next' });
    await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(next);

    await waitFor(() =>
      expect(controllerMocks.advanceStep).toHaveBeenCalledWith({
        runId: RUN_ID,
        tutorialId: TUTORIAL_ID,
        action: 'NEXT',
        targetLocated: true,
        destinationReady: true,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Run a query' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy();

    controllerMocks.advanceStep.mockResolvedValueOnce({
      ok: true,
      runId: RUN_ID,
      transition: 'PREVIOUS',
      progress: progressAt('step-open', { completedStepIds: ['step-open'] }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));

    await waitFor(() =>
      expect(controllerMocks.advanceStep).toHaveBeenLastCalledWith({
        runId: RUN_ID,
        tutorialId: TUTORIAL_ID,
        action: 'PREVIOUS',
        destinationReady: true,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Open Databases' })).toBeTruthy();
  });

  it('advances a target-only step when the highlighted Workspace control is activated', async () => {
    controllerMocks.advanceStep.mockResolvedValueOnce({
      ok: true,
      runId: RUN_ID,
      transition: 'NEXT',
      progress: progressAt('step-run-query', { completedStepIds: ['step-open'] }),
    });
    renderSurface(walkthroughAt('step-open'));

    await screen.findByRole('heading', { name: 'Open Databases' });
    const next = screen.getByRole('button', { name: 'Next' });
    await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false));
    const target = document.querySelector<HTMLElement>('#nav-databases');
    expect(target).not.toBeNull();
    fireEvent.click(target!);

    await waitFor(() =>
      expect(controllerMocks.advanceStep).toHaveBeenCalledWith({
        runId: RUN_ID,
        tutorialId: TUTORIAL_ID,
        action: 'NEXT',
        targetLocated: true,
        destinationReady: true,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Run a query' })).toBeTruthy();
  });

  it('waits for a non-empty field change instead of advancing when an input is focused', async () => {
    document.body.replaceChildren();
    const input = document.createElement('input');
    input.id = 'service-name';
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 40,
      width: 240,
      height: 40,
      right: 280,
      bottom: 140,
      x: 40,
      y: 100,
      toJSON: () => ({}),
    });
    document.body.append(input);

    const fieldStep: PauseTutorialRunInput['steps'][number] = {
      id: 'step-service-name',
      order: 1,
      title: 'Name the service',
      instructionalContent: 'Enter a recognizable service name.',
      destinationFeature: 'CATALOG_DATABASES',
      destinationHref: DESTINATION,
      targetControl: {
        id: 'service-name',
        accessibleName: 'Service name',
        selector: '#service-name',
      },
    };
    const fieldView: WalkthroughStepView = {
      step: {
        tutorialTitle: 'Connect a database',
        stepTitle: 'Name the service',
        stepNumber: 1,
        totalSteps: 2,
        content: [{ kind: 'text', text: 'Enter a recognizable service name.' }],
        targetAccessibleName: 'Service name',
        previousEnabled: false,
        forwardLabel: 'Next',
        forwardEnabled: true,
        selectedLocale: 'en',
        fallbackLocale: null,
      },
      destinationHref: DESTINATION,
      targetSelector: '#service-name',
      requiredActionId: null,
    };
    const walkthrough: ActiveWalkthrough = {
      ...walkthroughAt('step-open'),
      progress: progressAt(fieldStep.id),
      stepViews: new Map([[fieldStep.id, fieldView]]),
      steps: [fieldStep, steps[1]!],
    };
    controllerMocks.advanceStep.mockResolvedValue({
      ok: true,
      runId: RUN_ID,
      transition: 'NEXT',
      progress: progressAt('step-run-query', { completedStepIds: [fieldStep.id] }),
    });

    renderSurface(walkthrough);
    await screen.findByRole('heading', { name: 'Name the service' });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(input);
    expect(controllerMocks.advanceStep).not.toHaveBeenCalled();

    fireEvent.blur(input, { target: { value: '' } });
    expect(controllerMocks.advanceStep).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Orders warehouse' } });
    fireEvent.blur(input);
    await waitFor(() => expect(controllerMocks.advanceStep).toHaveBeenCalledOnce());
  });

  it('surfaces a blocked advance as the failure the controller reported', async () => {
    controllerMocks.advanceStep.mockResolvedValue({
      ok: false,
      runId: RUN_ID,
      reason: 'REQUIRED_ACTION_INCOMPLETE',
      progress: progressAt('step-open'),
    });
    renderSurface(walkthroughAt('step-open'));

    await clickWhenEnabled('Next');

    expect(
      await screen.findByText('The required action was not completed. Try again.'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Open Databases' })).toBeTruthy();
  });

  it('reports a target the spotlight could not locate and offers retry', async () => {
    document.body.replaceChildren();
    renderSurface(walkthroughAt('step-open'));

    // The target hook waits out its own five-second locate window before it
    // reports a miss, so this assertion has to outlast that window.
    expect(
      await screen.findByText(
        'The control for this step could not be found.',
        {},
        { timeout: 7_000 },
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
  }, 10_000);

  it('reports a destination that never became ready as a retryable failure', async () => {
    controllerMocks.advanceStep.mockResolvedValue({
      ok: false,
      runId: RUN_ID,
      reason: 'DESTINATION_NOT_READY',
      progress: progressAt('step-open'),
    });
    renderSurface(walkthroughAt('step-open'));

    await clickWhenEnabled('Next');

    expect(
      await screen.findByText('The workspace destination for this step did not become ready.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('pauses through the pause controller and closes the surface', async () => {
    const onClose = vi.fn();
    controllerMocks.pauseRun.mockResolvedValue({
      ok: true,
      progress: progressAt('step-open', { status: 'PAUSED' }),
    });
    renderSurface(walkthroughAt('step-open'), { onClose });

    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(controllerMocks.pauseRun).toHaveBeenCalledWith({
      progress: expect.objectContaining({ currentStepId: 'step-open' }),
      steps: [{ ...steps[0] }, { ...steps[1] }],
      pausedAt: expect.any(String),
      trigger: 'USER_REQUEST',
    });
  });

  it('keeps the walkthrough open and explains a pause that could not be persisted', async () => {
    const onClose = vi.fn();
    controllerMocks.pauseRun.mockResolvedValue({
      ok: false,
      progress: progressAt('step-open'),
    });
    renderSurface(walkthroughAt('step-open'), { onClose });

    fireEvent.click(await screen.findByRole('button', { name: 'Close and pause tutorial' }));

    expect(
      await screen.findByText(
        'The tutorial could not be paused. It remains open at the current step.',
      ),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Open Databases' })).toBeTruthy();
  });

  it('completes the final step and renders the completion summary', async () => {
    controllerMocks.completeRun.mockResolvedValue({
      ok: true,
      progress: progressAt('step-run-query', {
        status: 'COMPLETED',
        completedStepIds: ['step-open', 'step-run-query'],
      }),
      completion: { runId: RUN_ID, completedAt: completionSummary.completedAt },
    });
    renderSurface({
      ...walkthroughAt('step-run-query'),
      progress: progressAt('step-run-query', { completedStepIds: ['step-open'] }),
    });

    await clickWhenEnabled('Finish');

    await waitFor(() =>
      expect(controllerMocks.completeRun).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: RUN_ID,
          progress: expect.objectContaining({
            completedStepIds: ['step-open', 'step-run-query'],
          }),
        }),
      ),
    );
    expect(await screen.findByRole('heading', { name: 'Tutorial complete' })).toBeTruthy();
    expect(screen.getByText('Register a source')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Return to workspace' })).toBeTruthy();
  });

  it('reports a completion that could not be persisted and stays on the final step', async () => {
    controllerMocks.completeRun.mockResolvedValue({
      ok: false,
      progress: progressAt('step-run-query'),
    });
    renderSurface(walkthroughAt('step-run-query'));

    await clickWhenEnabled('Finish');

    expect(
      await screen.findByText(
        'Completion could not be saved. The tutorial remains open at the final step.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Run a query' })).toBeTruthy();
  });

  it('offers the next recommendation and repeats the tutorial through the repeat controller', async () => {
    const onOpenTutorialDetail = vi.fn();
    const onRepeatStarted = vi.fn();
    controllerMocks.completeRun.mockResolvedValue({
      ok: true,
      progress: progressAt('step-run-query', {
        status: 'COMPLETED',
        completedStepIds: ['step-open', 'step-run-query'],
      }),
      completion: { runId: RUN_ID, completedAt: completionSummary.completedAt },
    });
    controllerMocks.repeatTutorial
      .mockResolvedValueOnce({
        outcome: 'CONFIRMATION_REQUIRED',
        progress: progressAt('step-run-query', { status: 'COMPLETED' }),
      })
      .mockResolvedValueOnce({
        outcome: 'REPEATED',
        run: progressAt('step-open'),
        destinationHref: DESTINATION,
      });
    renderSurface(walkthroughAt('step-run-query'), { onOpenTutorialDetail, onRepeatStarted });

    await clickWhenEnabled('Finish');
    await screen.findByRole('heading', { name: 'Tutorial complete' });

    fireEvent.click(screen.getByRole('button', { name: 'View next tutorial' }));
    expect(onOpenTutorialDetail).toHaveBeenCalledWith('tutorial-query');

    fireEvent.click(screen.getByRole('button', { name: 'Repeat tutorial' }));

    const confirmation = await screen.findByRole('alertdialog');
    expect(
      within(confirmation).getByRole('heading', { name: 'Repeat this tutorial?' }),
    ).toBeTruthy();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Repeat tutorial' }));

    await waitFor(() =>
      expect(controllerMocks.repeatTutorial).toHaveBeenLastCalledWith(
        expect.objectContaining({ confirmed: true }),
      ),
    );
    await waitFor(() => expect(onRepeatStarted).toHaveBeenCalledWith(DESTINATION));
    expect(await screen.findByRole('heading', { name: 'Open Databases' })).toBeTruthy();
  });

  it('completes a Required Action by observing the unguided Workspace operation', async () => {
    controllerMocks.advanceStep.mockResolvedValue({
      ok: true,
      runId: RUN_ID,
      transition: 'ACTION_COMPLETED',
      progress: progressAt('step-run-query', { completedStepIds: ['step-run-query'] }),
    });
    const submitQuery = vi.fn(async () => ({ queryId: 'query-1' }));
    const observedSubmit = observeRunQueryRequiredAction(
      submitQuery as unknown as Parameters<typeof observeRunQueryRequiredAction>[0],
    );

    renderSurface(walkthroughAt('step-run-query'));
    await screen.findByRole('heading', { name: 'Run a query' });

    await observedSubmit({} as never);

    await waitFor(() =>
      expect(controllerMocks.advanceStep).toHaveBeenCalledWith({
        runId: RUN_ID,
        tutorialId: TUTORIAL_ID,
        action: 'COMPLETE_ACTION',
        requiredActionSucceeded: true,
      }),
    );
    expect(submitQuery).toHaveBeenCalledTimes(1);
  });

  it('automatically leaves an intermediate Required Action after its control unmounts', async () => {
    const intermediateActionView: WalkthroughStepView = {
      ...queryStepView,
      step: { ...queryStepView.step, forwardLabel: 'Next' },
    };
    const walkthrough = walkthroughAt('step-run-query');
    const intermediateWalkthrough: ActiveWalkthrough = {
      ...walkthrough,
      stepViews: new Map(walkthrough.stepViews).set('step-run-query', intermediateActionView),
    };
    controllerMocks.advanceStep
      .mockResolvedValueOnce({
        ok: true,
        runId: RUN_ID,
        transition: 'ACTION_COMPLETED',
        progress: progressAt('step-run-query', { completedStepIds: ['step-run-query'] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        runId: RUN_ID,
        transition: 'MOVED_FORWARD',
        progress: progressAt('step-open', { completedStepIds: ['step-run-query'] }),
      });
    const submitQuery = vi.fn(async () => ({ queryId: 'query-2' }));
    const observedSubmit = observeRunQueryRequiredAction(
      submitQuery as unknown as Parameters<typeof observeRunQueryRequiredAction>[0],
    );

    renderSurface(intermediateWalkthrough);
    await screen.findByRole('heading', { name: 'Run a query' });
    await observedSubmit({} as never);

    await waitFor(() => expect(controllerMocks.advanceStep).toHaveBeenCalledTimes(2));
    expect(controllerMocks.advanceStep).toHaveBeenNthCalledWith(2, {
      runId: RUN_ID,
      tutorialId: TUTORIAL_ID,
      action: 'NEXT',
      targetLocated: true,
      destinationReady: true,
    });
  });

  it('reports that step guidance is unavailable instead of inventing step content', () => {
    const onClose = vi.fn();
    renderSurface(null, { onClose });

    expect(screen.getByText(/Guidance for this tutorial step is not available/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Tutorial walkthrough' })).toBeNull();
    expect(useTutorialSessionStore.getState().activeRunId).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Return to workspace' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
