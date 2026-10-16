// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DESTINATION_READY_EVENT,
  useDestinationReady,
} from '@/app/_components/tutorials/use-destination-ready';
import { useTargetControl } from '@/app/_components/tutorials/use-target-control';

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
  static latest: ResizeObserverTestDouble | null = null;

  readonly disconnect = vi.fn();
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverTestDouble.latest = this;
  }

  emit(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

const originalResizeObserver = globalThis.ResizeObserver;
let originalPath = '/';

beforeEach(() => {
  originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  globalThis.ResizeObserver = ResizeObserverTestDouble as unknown as typeof ResizeObserver;
  ResizeObserverTestDouble.latest = null;
  document.body.replaceChildren();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  window.history.replaceState(null, '', originalPath);
  globalThis.ResizeObserver = originalResizeObserver;
  vi.restoreAllMocks();
});

describe('useTargetControl', () => {
  it('locates a target and scrolls its complete box into the viewport', async () => {
    const target = document.createElement('button');
    target.dataset.tutorialTarget = 'run-query';
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, 'scrollIntoView', { value: scrollIntoView });
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
      rect({ top: 1_200, left: 20, width: 160, height: 40 }),
    );
    document.body.append(target);

    const { result } = renderHook(() =>
      useTargetControl({
        selector: '[data-tutorial-target="run-query"]',
        timeoutMs: 100,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.element).toBe(target);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'center',
      inline: 'center',
    });
    expect(ResizeObserverTestDouble.latest?.observe).toHaveBeenCalledWith(target);
  });

  it('finds a target rendered after the hook mounts and updates its geometry', async () => {
    const { result, unmount } = renderHook(() =>
      useTargetControl({ selector: '#dynamic-target', timeoutMs: 1_000 }),
    );

    expect(result.current.status).toBe('locating');

    const target = document.createElement('button');
    target.id = 'dynamic-target';
    Object.defineProperty(target, 'scrollIntoView', { value: vi.fn() });
    const getRect = vi
      .spyOn(target, 'getBoundingClientRect')
      .mockReturnValue(rect({ top: 20, left: 20, width: 100, height: 30 }));

    act(() => document.body.append(target));
    await waitFor(() => expect(result.current.rect?.width).toBe(100));

    getRect.mockReturnValue(rect({ top: 40, left: 25, width: 180, height: 30 }));
    act(() => ResizeObserverTestDouble.latest?.emit());
    await waitFor(() => expect(result.current.rect?.width).toBe(180));

    const observer = ResizeObserverTestDouble.latest;
    unmount();
    expect(observer?.disconnect).toHaveBeenCalledOnce();
  });

  it('reports invalid selectors as not found without throwing', async () => {
    const { result } = renderHook(() => useTargetControl({ selector: '[invalid', timeoutMs: 100 }));

    await waitFor(() => expect(result.current.status).toBe('not-found'));
    expect(result.current.element).toBeNull();
  });
});

describe('useDestinationReady', () => {
  it('matches dynamic tutorial route segments against the current resource route', async () => {
    window.history.replaceState(null, '', '/databases/demo/sources/source-42?tab=scan');
    const target = document.createElement('button');
    target.dataset.tutorialTarget = 'run-metadata-crawler';
    document.body.append(target);

    const { result } = renderHook(() =>
      useDestinationReady({
        destinationHref: '/databases/:database/sources/:sourceId?tab=scan',
        requiredControlSelector: '[data-tutorial-target="run-metadata-crawler"]',
      }),
    );

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('waits for the requested route and required control to become interactive', async () => {
    window.history.replaceState(null, '', '/workspace/home');
    const { result } = renderHook(() =>
      useDestinationReady({
        destinationHref: '/workspace/query',
        requiredControlSelector: '[data-tutorial-target="run-query"]',
      }),
    );

    expect(result.current).toBe(false);

    const destination = document.createElement('main');
    destination.setAttribute('aria-busy', 'true');
    const target = document.createElement('button');
    target.dataset.tutorialTarget = 'run-query';
    destination.append(target);

    act(() => {
      window.history.pushState(null, '', '/workspace/query');
      document.body.append(destination);
    });
    await waitFor(() => expect(result.current).toBe(false));

    act(() => destination.removeAttribute('aria-busy'));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('honors an explicit readiness selector and resets when it becomes busy', async () => {
    window.history.replaceState(null, '', '/workspace/databases');
    const marker = document.createElement('main');
    marker.dataset.destinationReady = 'true';
    marker.setAttribute('aria-busy', 'true');
    document.body.append(marker);

    const { result } = renderHook(() =>
      useDestinationReady({
        destinationHref: '/workspace/databases/',
        readySelector: '[data-destination-ready="true"]',
      }),
    );

    await waitFor(() => expect(result.current).toBe(false));
    act(() => marker.removeAttribute('aria-busy'));
    await waitFor(() => expect(result.current).toBe(true));
    act(() => marker.setAttribute('aria-busy', 'true'));
    await waitFor(() => expect(result.current).toBe(false));
  });
});

describe('walkthrough destination lifecycle gating', () => {
  it('keeps a newly started walkthrough closed until navigation reaches an interactive destination', async () => {
    window.history.replaceState(null, '', '/workspace/home');
    const marker = document.createElement('main');
    marker.dataset.tutorialDestinationReady = 'false';
    const target = document.createElement('button');
    target.id = 'create-connection';
    target.disabled = true;
    marker.append(target);
    document.body.append(marker);

    const { result } = renderHook(() =>
      useDestinationReady({
        destinationHref: '/workspace/connections',
        requiredControlSelector: '#create-connection',
      }),
    );
    expect(result.current).toBe(false);

    act(() => {
      window.history.pushState(null, '', '/workspace/connections');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(result.current).toBe(false));

    act(() => {
      marker.dataset.tutorialDestinationReady = 'true';
      target.disabled = false;
      window.dispatchEvent(new Event(DESTINATION_READY_EVENT));
    });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('resets readiness for a resume-point destination and gates In Progress restoration on its control', async () => {
    window.history.replaceState(null, '', '/workspace/connections');
    const connectionsMarker = document.createElement('main');
    connectionsMarker.dataset.destinationReady = 'true';
    document.body.append(connectionsMarker);

    const { result, rerender } = renderHook(
      ({ destinationHref, requiredControlSelector }) =>
        useDestinationReady({ destinationHref, requiredControlSelector }),
      {
        initialProps: {
          destinationHref: '/workspace/connections',
          requiredControlSelector: null as string | null,
        },
      },
    );
    await waitFor(() => expect(result.current).toBe(true));

    rerender({
      destinationHref: '/workspace/query',
      requiredControlSelector: '#run-query',
    });
    await waitFor(() => expect(result.current).toBe(false));

    const queryMarker = document.createElement('main');
    queryMarker.dataset.destinationReady = 'true';
    const runQuery = document.createElement('button');
    runQuery.id = 'run-query';
    queryMarker.append(runQuery);
    act(() => {
      connectionsMarker.remove();
      document.body.append(queryMarker);
      window.history.pushState(null, '', '/workspace/query');
      window.dispatchEvent(new Event(DESTINATION_READY_EVENT));
    });
    await waitFor(() => expect(result.current).toBe(true));
  });
});
