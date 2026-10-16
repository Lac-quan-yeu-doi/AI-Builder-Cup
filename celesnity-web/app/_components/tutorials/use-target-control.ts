'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';

export type TargetControlStatus = 'idle' | 'locating' | 'ready' | 'not-found';

export interface UseTargetControlOptions {
  readonly selector: string | null | undefined;
  readonly enabled?: boolean;
  readonly timeoutMs?: number;
  readonly scrollBehavior?: ScrollBehavior;
  readonly viewportMargin?: number;
}

export interface TargetControlState {
  readonly element: Element | null;
  readonly rect: DOMRectReadOnly | null;
  readonly status: TargetControlStatus;
  readonly retry: () => void;
}

interface TargetControlSnapshot {
  readonly element: Element | null;
  readonly rect: DOMRectReadOnly | null;
  readonly status: TargetControlStatus;
}

interface QueryResult {
  readonly element: Element | null;
  readonly valid: boolean;
}

interface ViewportBounds {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const DEFAULT_TARGET_TIMEOUT_MS = 5_000;
const INITIAL_SNAPSHOT: TargetControlSnapshot = {
  element: null,
  rect: null,
  status: 'idle',
};

function queryTarget(selector: string): QueryResult {
  try {
    return { element: document.querySelector(selector), valid: true };
  } catch {
    return { element: null, valid: false };
  }
}

function getViewportBounds(): ViewportBounds {
  const viewport = window.visualViewport;
  if (viewport) {
    return {
      top: viewport.offsetTop,
      right: viewport.offsetLeft + viewport.width,
      bottom: viewport.offsetTop + viewport.height,
      left: viewport.offsetLeft,
    };
  }

  return {
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    left: 0,
  };
}

function isFullyInViewport(rect: DOMRectReadOnly, margin: number): boolean {
  const viewport = getViewportBounds();
  return (
    rect.top >= viewport.top + margin &&
    rect.left >= viewport.left + margin &&
    rect.bottom <= viewport.bottom - margin &&
    rect.right <= viewport.right - margin
  );
}

function equalRects(left: DOMRectReadOnly | null, right: DOMRectReadOnly): boolean {
  return (
    left !== null &&
    left.top === right.top &&
    left.right === right.right &&
    left.bottom === right.bottom &&
    left.left === right.left &&
    left.width === right.width &&
    left.height === right.height
  );
}

function normalizedTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs)) return DEFAULT_TARGET_TIMEOUT_MS;
  return Math.max(0, timeoutMs);
}

/**
 * Locates a tutorial target, brings its complete box into the viewport, and
 * keeps its geometry synchronized while layout, scrolling, or the DOM changes.
 */
export function useTargetControl({
  selector,
  enabled = true,
  timeoutMs = DEFAULT_TARGET_TIMEOUT_MS,
  scrollBehavior = 'auto',
  viewportMargin = 8,
}: UseTargetControlOptions): TargetControlState {
  const [snapshot, setSnapshot] = useState<TargetControlSnapshot>(INITIAL_SNAPSHOT);
  const [attempt, incrementAttempt] = useReducer((value: number) => value + 1, 0);
  const retry = useCallback(() => incrementAttempt(), []);

  useEffect(() => {
    const normalizedSelector = selector?.trim() ?? '';
    if (!enabled || normalizedSelector.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- selector changes invalidate the previous DOM snapshot
      setSnapshot(INITIAL_SNAPSHOT);
      return;
    }

    let active = true;
    let observedElement: Element | null = null;
    let animationFrame: number | null = null;
    let notFoundTimer: number | null = null;
    const margin = Math.max(0, viewportMargin);
    const requestFrame: (callback: FrameRequestCallback) => number =
      typeof window.requestAnimationFrame === 'function'
        ? (callback) => window.requestAnimationFrame(callback)
        : (callback) => window.setTimeout(() => callback(performance.now()), 0);
    const cancelFrame: (handle: number) => void =
      typeof window.cancelAnimationFrame === 'function'
        ? (handle) => window.cancelAnimationFrame(handle)
        : (handle) => window.clearTimeout(handle);

    setSnapshot({ element: null, rect: null, status: 'locating' });

    const publishMeasurement = (element: Element) => {
      if (!active || !element.isConnected) return;

      let rect = element.getBoundingClientRect();
      if (!isFullyInViewport(rect, margin) && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({
          behavior: scrollBehavior,
          block: 'center',
          inline: 'center',
        });
        rect = element.getBoundingClientRect();
      }

      setSnapshot((current) => {
        if (
          current.status === 'ready' &&
          current.element === element &&
          equalRects(current.rect, rect)
        ) {
          return current;
        }
        return { element, rect, status: 'ready' };
      });
    };

    const scheduleMeasurement = () => {
      if (animationFrame !== null) return;
      animationFrame = requestFrame(() => {
        animationFrame = null;
        if (observedElement?.isConnected) {
          publishMeasurement(observedElement);
        } else {
          synchronizeTarget();
        }
      });
    };

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => scheduleMeasurement());

    const observeElement = (element: Element) => {
      if (observedElement === element) return;
      if (observedElement) resizeObserver?.unobserve(observedElement);
      observedElement = element;
      resizeObserver?.observe(element);
    };

    const armNotFoundTimer = () => {
      if (notFoundTimer !== null) window.clearTimeout(notFoundTimer);
      notFoundTimer = window.setTimeout(() => {
        if (!active || observedElement?.isConnected) return;
        setSnapshot({ element: null, rect: null, status: 'not-found' });
      }, normalizedTimeout(timeoutMs));
    };

    function synchronizeTarget(): void {
      const result = queryTarget(normalizedSelector);
      if (!result.valid) {
        setSnapshot({ element: null, rect: null, status: 'not-found' });
        return;
      }

      if (!result.element) {
        if (observedElement) resizeObserver?.unobserve(observedElement);
        observedElement = null;
        setSnapshot((current) =>
          current.status === 'not-found'
            ? current
            : { element: null, rect: null, status: 'locating' },
        );
        armNotFoundTimer();
        return;
      }

      if (notFoundTimer !== null) {
        window.clearTimeout(notFoundTimer);
        notFoundTimer = null;
      }
      observeElement(result.element);
      publishMeasurement(result.element);
    }

    synchronizeTarget();

    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => synchronizeTarget());
    mutationObserver?.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    const onViewportChange = () => scheduleMeasurement();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('scroll', onViewportChange);

    return () => {
      active = false;
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('scroll', onViewportChange);
      if (animationFrame !== null) cancelFrame(animationFrame);
      if (notFoundTimer !== null) window.clearTimeout(notFoundTimer);
    };
  }, [attempt, enabled, scrollBehavior, selector, timeoutMs, viewportMargin]);

  return { ...snapshot, retry };
}
