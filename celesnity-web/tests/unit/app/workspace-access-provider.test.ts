// @vitest-environment jsdom

/* eslint-disable react/no-children-prop --
 * Tests are plain .ts files, so elements are built with createElement. Passing
 * children through props keeps the required `children` prop type-checked. */

import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WorkspaceAccessProvider,
  useWorkspaceAccess,
} from '@/app/_providers/workspace-access-provider';
import {
  WORKSPACE_ACCESS_DENIED_EVENT,
  type WorkspaceFeature,
} from '@/src/entities/models/workspace-feature';

const pathname = vi.hoisted(() => ({ current: '/chat' }));
const loadSession = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
}));

vi.mock('@/di/container', () => ({
  getInjection: (token: string) => {
    if (token === 'LoadAdministrationSessionController') return loadSession;
    throw new Error(`Unexpected injection: ${token}`);
  },
}));

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const signedInAt = new Date('2026-09-26T03:00:00.000Z').getTime();
const minuteLater = signedInAt + 61_000;

function AccessProbe() {
  const access = useWorkspaceAccess();
  const features = access.visibleFeatures === null ? 'all' : access.visibleFeatures.join(',');
  return createElement(
    'div',
    null,
    createElement('output', { 'aria-label': 'Workspace access' }, `${access.status}:${features}`),
    createElement('button', { onClick: () => void access.reload(), type: 'button' }, 'Retry'),
  );
}

function renderAccess(
  initialVisibleFeatures: readonly WorkspaceFeature[] | null,
  initialError = false,
) {
  const tree = () =>
    createElement(WorkspaceAccessProvider, {
      children: createElement(AccessProbe),
      initialError,
      initialVisibleFeatures,
    });
  const view = render(tree());
  return {
    navigate(next: string) {
      pathname.current = next;
      view.rerender(tree());
    },
    unmount: view.unmount,
  };
}

function access(): string | null {
  return screen.getByLabelText('Workspace access').textContent;
}

function announceDenial() {
  window.dispatchEvent(new Event(WORKSPACE_ACCESS_DENIED_EVENT));
}

beforeEach(() => {
  // Only the clock: React and Testing Library still need real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(signedInAt);
  pathname.current = '/chat';
  loadSession.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WorkspaceAccessProvider', () => {
  it('keeps the known access on screen while a navigation re-checks it', async () => {
    const check = deferred<{ visibleFeatures: WorkspaceFeature[] }>();
    loadSession.mockReturnValue(check.promise);
    const { navigate } = renderAccess(['HOME', 'QUERY']);

    vi.setSystemTime(minuteLater);
    navigate('/sql');

    expect(access()).toBe('ready:HOME,QUERY');
    expect(loadSession).toHaveBeenCalledTimes(1);

    await act(async () => check.resolve({ visibleFeatures: ['HOME'] }));
    expect(access()).toBe('ready:HOME');
  });

  /* A feature revoked or granted since sign-in still shows up at the next
     click, as it did when the check blocked — the check just no longer
     replaces the destination while it runs. */
  it('re-checks in the background on every navigation without leaving ready', async () => {
    loadSession
      .mockResolvedValueOnce({ visibleFeatures: ['HOME', 'QUERY', 'DOCUMENTS'] })
      .mockResolvedValueOnce({ visibleFeatures: ['HOME'] });
    const { navigate } = renderAccess(['HOME', 'QUERY', 'DOCUMENTS']);

    navigate('/sql');
    expect(access()).toBe('ready:HOME,QUERY,DOCUMENTS');
    await act(async () => undefined);
    expect(loadSession).toHaveBeenCalledTimes(1);

    navigate('/documents');
    expect(access()).toBe('ready:HOME,QUERY,DOCUMENTS');
    await act(async () => undefined);

    expect(loadSession).toHaveBeenCalledTimes(2);
    expect(access()).toBe('ready:HOME');
  });

  it('shares one check between navigations that land while it is in flight', async () => {
    const check = deferred<{ visibleFeatures: WorkspaceFeature[] }>();
    loadSession.mockReturnValue(check.promise);
    const { navigate } = renderAccess(['HOME']);

    navigate('/sql');
    navigate('/documents');
    navigate('/chat');
    await act(async () => check.resolve({ visibleFeatures: ['HOME', 'QUERY'] }));

    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(access()).toBe('ready:HOME,QUERY');
  });

  it('keeps the known access when a background check fails', async () => {
    loadSession.mockRejectedValue(new Error('Core is unreachable'));
    const { navigate } = renderAccess(['HOME', 'QUERY']);

    vi.setSystemTime(minuteLater);
    navigate('/sql');
    await act(async () => undefined);

    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(access()).toBe('ready:HOME,QUERY');
  });

  it('re-checks as soon as the server denies a feature', async () => {
    loadSession.mockResolvedValue({ visibleFeatures: ['HOME'] });
    renderAccess(['HOME', 'QUERY']);

    vi.setSystemTime(signedInAt + 6_000);
    await act(async () => announceDenial());

    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(access()).toBe('ready:HOME');
  });

  it('answers a burst of denials with a single check', async () => {
    const check = deferred<{ visibleFeatures: WorkspaceFeature[] }>();
    loadSession.mockReturnValue(check.promise);
    renderAccess(['HOME', 'QUERY']);

    vi.setSystemTime(signedInAt + 6_000);
    act(() => {
      announceDenial();
      announceDenial();
      announceDenial();
    });
    await act(async () => check.resolve({ visibleFeatures: ['HOME'] }));

    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(access()).toBe('ready:HOME');
  });

  it('ignores a denial that arrives right after a check', async () => {
    renderAccess(['HOME', 'QUERY']);

    vi.setSystemTime(signedInAt + 1_000);
    await act(async () => announceDenial());

    expect(loadSession).not.toHaveBeenCalled();
  });

  it('stops listening for denials once unmounted', async () => {
    const { unmount } = renderAccess(['HOME', 'QUERY']);
    unmount();

    vi.setSystemTime(minuteLater);
    announceDenial();
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();

    expect(loadSession).not.toHaveBeenCalled();
  });

  it('re-checks a stale access when the window regains focus', async () => {
    loadSession.mockResolvedValue({ visibleFeatures: ['HOME'] });
    renderAccess(['HOME', 'QUERY']);

    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(loadSession).not.toHaveBeenCalled();

    vi.setSystemTime(minuteLater);
    await act(async () => window.dispatchEvent(new Event('focus')));

    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(access()).toBe('ready:HOME');
  });

  it('shows the error state only without known access, and recovers through retry', async () => {
    const failed = deferred<{ visibleFeatures: WorkspaceFeature[] }>();
    const recovered = deferred<{ visibleFeatures: WorkspaceFeature[] }>();
    loadSession.mockReturnValueOnce(failed.promise).mockReturnValueOnce(recovered.promise);
    renderAccess(null, true);
    expect(access()).toBe('error:all');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(access()).toBe('loading:all');
    await act(async () => failed.reject(new Error('Core is unreachable')));
    expect(access()).toBe('error:all');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => recovered.resolve({ visibleFeatures: ['HOME'] }));
    expect(access()).toBe('ready:HOME');
  });
});
