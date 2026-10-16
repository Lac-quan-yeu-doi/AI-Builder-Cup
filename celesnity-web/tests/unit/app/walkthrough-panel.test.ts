// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WalkthroughPanel,
  type WalkthroughFailureReason,
  type WalkthroughPanelProps,
} from '@/app/_components/tutorials/walkthrough-panel';
import { defaultLocale } from '@/app/_i18n/locales';
import { useLocaleStore } from '@/app/_stores/locale.store';
import type { StepViewModel } from '@/src/interface-adapters/presenters/walkthrough.presenter';
import { renderUi } from '@/tests/support/render-ui';

const step: StepViewModel = {
  tutorialTitle: 'Connect a data source without losing your existing workspace state',
  stepTitle: 'Create the connection',
  stepNumber: 2,
  totalSteps: 4,
  content: [
    { kind: 'text', text: 'Open ' },
    { kind: 'emphasis', text: 'Connections' },
    { kind: 'text', text: ' and enter the required values.' },
    { kind: 'action-callout', text: 'Select New connection to continue.' },
  ],
  targetAccessibleName: 'New connection',
  previousEnabled: true,
  forwardLabel: 'Next',
  forwardEnabled: true,
  selectedLocale: 'en',
  fallbackLocale: null,
};

function createProps(overrides: Partial<WalkthroughPanelProps> = {}): WalkthroughPanelProps {
  return {
    step,
    onForward: vi.fn(),
    onPause: vi.fn(),
    onPrevious: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: defaultLocale });
});

describe('WalkthroughPanel', () => {
  it('renders complete step content, emphasized text, action callouts, and the target name', () => {
    renderUi(createElement(WalkthroughPanel, createProps()));

    expect(screen.getByRole('region', { name: 'Tutorial walkthrough' })).toBeDefined();
    expect(
      screen.getByText('Connect a data source without losing your existing workspace state'),
    ).toBeDefined();
    expect(screen.getByText('Step 2 of 4')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Create the connection' })).toBeDefined();
    expect(screen.getByText('Connections').tagName).toBe('STRONG');

    const callout = screen.getByRole('note', { name: 'Action required' });
    expect(within(callout).getByText('Select New connection to continue.')).toBeDefined();

    const target = screen.getByRole('region', { name: 'Use this workspace control' });
    expect(within(target).getByText('New connection')).toBeDefined();
  });

  it('invokes Previous and localized Next or Finish callbacks from presenter navigation state', () => {
    const onPrevious = vi.fn();
    const onForward = vi.fn();
    const { rerender } = renderUi(
      createElement(WalkthroughPanel, createProps({ onForward, onPrevious })),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onForward).toHaveBeenCalledOnce();

    rerender(
      createElement(
        WalkthroughPanel,
        createProps({
          onForward,
          onPrevious,
          step: { ...step, forwardLabel: 'Finish' },
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onForward).toHaveBeenCalledTimes(2);
  });

  it('respects presenter availability and operational transition gating', () => {
    const { rerender } = renderUi(
      createElement(
        WalkthroughPanel,
        createProps({
          step: { ...step, previousEnabled: false, forwardEnabled: false },
        }),
      ),
    );

    expect(screen.getByRole('button', { name: 'Previous' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);

    rerender(createElement(WalkthroughPanel, createProps({ state: { kind: 'transitioning' } })));
    expect(screen.getByRole('button', { name: 'Previous' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Preparing the workspace for this step…')).toBeDefined();
  });

  it('uses the same pause request for the visible Pause and close controls', () => {
    const onPause = vi.fn();
    renderUi(createElement(WalkthroughPanel, createProps({ onPause })));

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close and pause tutorial' }));

    expect(onPause).toHaveBeenCalledTimes(2);
  });

  it.each<readonly [WalkthroughFailureReason, string]>([
    ['destination-readiness', 'The workspace destination for this step did not become ready.'],
    [
      'destination-transition',
      'The tutorial could not move to the required workspace destination.',
    ],
    ['target-not-found', 'The control for this step could not be found.'],
  ])('identifies %s failure and provides retry and pause actions', (reason, message) => {
    const onPause = vi.fn();
    const onRetry = vi.fn();
    renderUi(
      createElement(
        WalkthroughPanel,
        createProps({
          onPause,
          onRetry,
          state: { kind: 'failure', reason },
        }),
      ),
    );

    expect(screen.getByRole('alert').textContent).toContain(message);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onPause).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Previous' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);
  });

  it('renders named fallback notice and localized controls without changing tutorial content', () => {
    useLocaleStore.setState({ locale: 'vi' });
    renderUi(
      createElement(
        WalkthroughPanel,
        createProps({
          step: {
            ...step,
            selectedLocale: 'vi',
            fallbackLocale: { code: 'en', name: 'English' },
          },
        }),
      ),
    );

    expect(
      screen.getByText(
        'Nội dung hướng dẫn này không có trong ngôn ngữ bạn đã chọn. Nội dung sẽ được hiển thị bằng English.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Trước' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tiếp' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tạm dừng' })).toBeDefined();
  });

  it('stays within the narrow viewport and inherits the host right-edge width on wide screens', () => {
    renderUi(createElement(WalkthroughPanel, createProps()));

    const panel = screen.getByRole('region', { name: 'Tutorial walkthrough' });
    const classes = new Set(panel.className.split(' '));
    expect(classes.has('w-full')).toBe(true);
    expect(classes.has('max-w-full')).toBe(true);
    expect(classes.has('overflow-x-hidden')).toBe(true);
    expect(classes.has('min-[1024px]:ml-auto')).toBe(true);
    expect(classes.has('min-[1024px]:w-[24rem]')).toBe(true);
  });
});

describe('WalkthroughPanel accessibility integration', () => {
  it('moves focus into the walkthrough and restores the opener when the surface closes', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open tutorial';
    document.body.append(opener);
    opener.focus();

    const view = renderUi(createElement(WalkthroughPanel, createProps()));
    const heading = await screen.findByRole('heading', { name: step.stepTitle });
    expect(document.activeElement).toBe(heading);

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('falls back to the nearest workspace heading when the opener is removed', async () => {
    const workspace = document.createElement('main');
    const workspaceHeading = document.createElement('h1');
    workspaceHeading.textContent = 'Query workspace';
    workspace.append(workspaceHeading);
    const opener = document.createElement('button');
    workspace.append(opener);
    document.body.append(workspace);
    opener.focus();

    const view = renderUi(createElement(WalkthroughPanel, createProps()));
    await screen.findByRole('heading', { name: step.stepTitle });
    opener.remove();
    view.unmount();

    expect(document.activeElement).toBe(workspaceHeading);
    expect(workspaceHeading.tabIndex).toBe(-1);
    workspace.remove();
  });

  it('provides a keyboard focus path to the highlighted target and back with Escape', async () => {
    const target = document.createElement('button');
    target.textContent = step.targetAccessibleName ?? '';
    document.body.append(target);

    renderUi(createElement(WalkthroughPanel, createProps({ targetControl: target })));
    const heading = await screen.findByRole('heading', { name: step.stepTitle });
    fireEvent.click(screen.getByRole('button', { name: 'Move to highlighted control' }));
    expect(document.activeElement).toBe(target);

    fireEvent.keyDown(target, { key: 'Escape' });
    expect(document.activeElement).toBe(heading);
    target.remove();
  });

  it('announces the complete position, title, and target description when the step changes', async () => {
    const { rerender } = renderUi(createElement(WalkthroughPanel, createProps()));
    const liveRegion = screen.getByText('Create the connection. Step 2 of 4.').parentElement;
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
    expect(liveRegion?.textContent).toContain('Highlighted control: New connection.');

    rerender(
      createElement(
        WalkthroughPanel,
        createProps({
          step: {
            ...step,
            stepTitle: 'Verify the connection',
            stepNumber: 3,
            targetAccessibleName: 'Test connection',
          },
        }),
      ),
    );

    expect(await screen.findByText('Verify the connection. Step 3 of 4.')).toBeDefined();
    expect(screen.getByText('Highlighted control: Test connection.')).toBeDefined();
  });

  it('exposes every enabled tutorial control as a keyboard-reachable native button', () => {
    renderUi(createElement(WalkthroughPanel, createProps()));

    for (const name of ['Close and pause tutorial', 'Pause', 'Previous', 'Next']) {
      const control = screen.getByRole('button', { name });
      expect(control.tagName).toBe('BUTTON');
      expect((control as HTMLButtonElement).disabled).toBe(false);
      expect((control as HTMLButtonElement).tabIndex).toBe(0);
    }
  });
});
