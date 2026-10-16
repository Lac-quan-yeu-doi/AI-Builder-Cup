// @vitest-environment jsdom

import { createElement, Fragment } from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpotlightOverlay } from '@/app/_components/tutorials/spotlight-overlay';
import { DESTINATION_READY_EVENT } from '@/app/_components/tutorials/use-destination-ready';
import {
  WalkthroughLifecycleHost,
  type WalkthroughLifecycleLaunch,
} from '@/app/_components/tutorials/walkthrough-lifecycle-host';
import { WalkthroughPanel } from '@/app/_components/tutorials/walkthrough-panel';
import { defaultLocale } from '@/app/_i18n/locales';
import { useLocaleStore } from '@/app/_stores/locale.store';
import type {
  ResumeTutorialRunViewModel,
  StartTutorialRunViewModel,
  TutorialProgressViewModel,
} from '@/src/interface-adapters/presenters/tutorial-run.presenter';
import type { StepViewModel } from '@/src/interface-adapters/presenters/walkthrough.presenter';
import { renderUi as render } from '@/tests/support/render-ui';

function rect(values: {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}): DOMRect {
  return {
    ...values,
    right: values.left + values.width,
    bottom: values.top + values.height,
    x: values.left,
    y: values.top,
    toJSON: () => ({}),
  };
}

class ResizeObserverTestDouble {
  static instances: ResizeObserverTestDouble[] = [];

  readonly disconnect = vi.fn();
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverTestDouble.instances.push(this);
  }

  emit(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

const progress: TutorialProgressViewModel = {
  tutorialId: 'query-basics',
  memberId: 'member-1',
  organizationId: 'organization-1',
  status: 'IN_PROGRESS',
  currentStepId: 'run-query-step',
  completedStepIds: [],
  contextSelections: [],
  updatedAt: '2026-01-02T03:04:05.000Z',
};

const step: StepViewModel = {
  tutorialTitle: 'Query workspace basics',
  stepTitle: 'Run your first query',
  stepNumber: 1,
  totalSteps: 2,
  content: [{ kind: 'text', text: 'Run the prepared query.' }],
  targetAccessibleName: 'Run query',
  previousEnabled: false,
  forwardLabel: 'Next',
  forwardEnabled: false,
  selectedLocale: 'en',
  fallbackLocale: null,
};

const originalResizeObserver = globalThis.ResizeObserver;
let originalPath = '/';

function walkthroughChildren(targetSelector: string | null = '#run-query') {
  return createElement(
    Fragment,
    null,
    createElement(WalkthroughPanel, {
      step:
        targetSelector === null
          ? { ...step, targetAccessibleName: undefined, forwardEnabled: true }
          : step,
      targetControl:
        targetSelector === null ? null : document.querySelector<HTMLElement>(targetSelector),
      onPrevious: vi.fn(),
      onForward: vi.fn(),
      onPause: vi.fn(),
      onRetry: vi.fn(),
    }),
    createElement(SpotlightOverlay, {
      targetSelector,
      targetDescription: targetSelector === null ? '' : 'Highlighted control: Run query.',
    }),
  );
}

function navigate(destinationHref: string): void {
  window.history.pushState(null, '', destinationHref);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function observerFor(element: Element): ResizeObserverTestDouble | undefined {
  return ResizeObserverTestDouble.instances.find((observer) =>
    observer.observe.mock.calls.some(([observed]) => observed === element),
  );
}

beforeEach(() => {
  originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  document.body.replaceChildren();
  ResizeObserverTestDouble.instances = [];
  globalThis.ResizeObserver = ResizeObserverTestDouble as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  window.history.replaceState(null, '', originalPath);
  globalThis.ResizeObserver = originalResizeObserver;
  useLocaleStore.setState({ locale: defaultLocale });
  vi.restoreAllMocks();
});

describe('WalkthroughLifecycleHost integration', () => {
  it('requests a conflict choice, navigates a started run, and opens the focused spotlight only when Destination Ready', async () => {
    window.history.replaceState(null, '', '/home');
    const opener = document.createElement('button');
    opener.textContent = 'Open tutorial';
    document.body.append(opener);
    opener.focus();

    const started: StartTutorialRunViewModel = {
      outcome: 'STARTED',
      run: progress,
      destinationHref: '/query',
    };
    const conflict: StartTutorialRunViewModel = {
      outcome: 'CONFLICT_REQUIRES_CHOICE',
      activeRun: { ...progress, tutorialId: 'active-tutorial' },
      choices: ['PAUSE_ACTIVE', 'CANCEL_NEW_START'],
    };
    const execute = vi
      .fn<Extract<WalkthroughLifecycleLaunch, { kind: 'start' }>['execute']>()
      .mockResolvedValueOnce(conflict)
      .mockResolvedValueOnce(started);
    const launch: WalkthroughLifecycleLaunch = { kind: 'start', execute };
    const onNavigate = vi.fn(navigate);
    const view = render(
      createElement(
        WalkthroughLifecycleHost,
        {
          launch,
          navigate: onNavigate,
          requiredControlSelector: '#run-query',
        },
        walkthroughChildren(),
      ),
    );

    expect(
      await screen.findByRole('heading', { name: 'Another tutorial is in progress' }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Pause current tutorial and start this one' }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Keep current tutorial' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Tutorial walkthrough' })).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Pause current tutorial and start this one' }),
    );
    await waitFor(() => {
      expect(execute).toHaveBeenLastCalledWith('PAUSE_ACTIVE');
      expect(onNavigate).toHaveBeenCalledWith('/query');
    });
    expect(window.location.pathname).toBe('/query');
    expect(screen.queryByRole('region', { name: 'Tutorial walkthrough' })).toBeNull();

    const destination = document.createElement('main');
    destination.dataset.tutorialDestinationReady = 'true';
    const target = document.createElement('button');
    target.id = 'run-query';
    target.textContent = 'Run query';
    Object.defineProperty(target, 'scrollIntoView', { value: vi.fn() });
    const targetRect = vi
      .spyOn(target, 'getBoundingClientRect')
      .mockReturnValue(rect({ top: 120, left: 80, width: 140, height: 40 }));
    destination.append(target);

    act(() => {
      document.body.append(destination);
      window.dispatchEvent(new Event(DESTINATION_READY_EVENT));
    });

    const heading = await screen.findByRole('heading', { name: 'Run your first query' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText('Run your first query. Step 1 of 2.')).toBeDefined();
    expect(screen.getAllByText('Highlighted control: Run query.')).toHaveLength(2);
    await waitFor(() =>
      expect(
        view.container.querySelector('[data-spotlight-cutout="target"]')?.getAttribute('x'),
      ).toBe('76'),
    );

    targetRect.mockReturnValue(rect({ top: 72, left: 44, width: 160, height: 40 }));
    act(() => observerFor(target)?.emit());
    await waitFor(() =>
      expect(
        view.container.querySelector('[data-spotlight-cutout="target"]')?.getAttribute('x'),
      ).toBe('40'),
    );

    view.unmount();
    expect(document.activeElement).toBe(opener);
  });

  it('requests the same conflict choice before resuming a paused tutorial', async () => {
    window.history.replaceState(null, '', '/databases');
    const pausedProgress: TutorialProgressViewModel = { ...progress, status: 'PAUSED' };
    const conflict: ResumeTutorialRunViewModel = {
      outcome: 'CONFLICT_REQUIRES_CHOICE',
      activeRun: { ...progress, tutorialId: 'active-tutorial' },
      choices: ['PAUSE_ACTIVE', 'CANCEL_NEW_START'],
    };
    const blocked: ResumeTutorialRunViewModel = {
      outcome: 'BLOCKED',
      progress: pausedProgress,
      destinationHref: '/query',
      blockers: {
        blockingFeatureIds: [],
        unsatisfiedPrerequisiteIds: [],
        replacementRequiredRequirementIds: [],
        destinationNotReady: true,
      },
    };
    const resumed: ResumeTutorialRunViewModel = {
      outcome: 'RESUMED',
      progress,
      destinationHref: '/query',
    };
    const execute = vi
      .fn<Extract<WalkthroughLifecycleLaunch, { kind: 'resume' }>['execute']>()
      .mockResolvedValueOnce(conflict)
      .mockResolvedValueOnce(blocked)
      .mockResolvedValueOnce(resumed);
    const onNavigate = vi.fn(navigate);

    render(
      createElement(WalkthroughLifecycleHost, {
        launch: { kind: 'resume', execute },
        navigate: onNavigate,
      }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Another tutorial is in progress' }),
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole('button', { name: 'Pause current tutorial and resume this one' }),
    );

    await waitFor(() => {
      expect(execute).toHaveBeenNthCalledWith(2, false, 'PAUSE_ACTIVE');
      expect(onNavigate).toHaveBeenCalledWith('/query');
    });
  });

  it('keeps a paused run closed through resume navigation and restores In Progress only after readiness', async () => {
    window.history.replaceState(null, '', '/databases');
    const pausedProgress: TutorialProgressViewModel = { ...progress, status: 'PAUSED' };
    const blocked: ResumeTutorialRunViewModel = {
      outcome: 'BLOCKED',
      progress: pausedProgress,
      destinationHref: '/query',
      blockers: {
        blockingFeatureIds: [],
        unsatisfiedPrerequisiteIds: [],
        replacementRequiredRequirementIds: [],
        destinationNotReady: true,
      },
    };
    const resumed: ResumeTutorialRunViewModel = {
      outcome: 'RESUMED',
      progress,
      destinationHref: '/query',
    };
    const execute = vi
      .fn<Extract<WalkthroughLifecycleLaunch, { kind: 'resume' }>['execute']>()
      .mockImplementation(async (destinationReady) => (destinationReady ? resumed : blocked));
    const launch: WalkthroughLifecycleLaunch = { kind: 'resume', execute };
    const onNavigate = vi.fn(navigate);

    render(
      createElement(
        WalkthroughLifecycleHost,
        {
          launch,
          navigate: onNavigate,
          readySelector: '[data-destination-ready="true"]',
        },
        walkthroughChildren(null),
      ),
    );

    await waitFor(() => {
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith(false);
      expect(onNavigate).toHaveBeenCalledWith('/query');
    });
    expect(screen.queryByRole('region', { name: 'Tutorial walkthrough' })).toBeNull();

    const marker = document.createElement('main');
    marker.dataset.destinationReady = 'true';
    act(() => {
      document.body.append(marker);
      window.dispatchEvent(new Event(DESTINATION_READY_EVENT));
    });

    await waitFor(() => {
      expect(execute).toHaveBeenCalledTimes(2);
      expect(execute).toHaveBeenLastCalledWith(true);
    });
    expect(await screen.findByRole('heading', { name: 'Run your first query' })).toBeDefined();
    expect(document.querySelector('[data-spotlight-overlay]')).toBeNull();
  });
});
