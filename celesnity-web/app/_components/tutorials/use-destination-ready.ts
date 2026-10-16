'use client';

import { useEffect, useState } from 'react';

export const DESTINATION_READY_EVENT = 'celesnity:destination-ready';
export const DESTINATION_READY_MARKER_SELECTOR =
  '[data-destination-ready], [data-tutorial-destination-ready]';

const POSITIVE_DESTINATION_READY_MARKER_SELECTOR =
  '[data-destination-ready="true"], [data-tutorial-destination-ready="true"]';

export interface UseDestinationReadyOptions {
  readonly destinationHref: string | null | undefined;
  readonly enabled?: boolean;
  readonly readySelector?: string | null;
  readonly requiredControlSelector?: string | null;
}

function normalizePathname(pathname: string): string {
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '');
}

function matchesPathnamePattern(expectedPathname: string, currentPathname: string): boolean {
  const expectedSegments = normalizePathname(expectedPathname).split('/');
  const currentSegments = normalizePathname(currentPathname).split('/');
  if (expectedSegments.length !== currentSegments.length) return false;

  return expectedSegments.every(
    (segment, index) =>
      (segment.startsWith(':') && currentSegments[index]?.length !== 0) ||
      segment === currentSegments[index],
  );
}

function matchesCurrentDestination(destinationHref: string): boolean {
  try {
    const expected = new URL(destinationHref, window.location.href);
    const current = new URL(window.location.href);
    return (
      expected.origin === current.origin &&
      matchesPathnamePattern(expected.pathname, current.pathname) &&
      (expected.search.length === 0 || expected.search === current.search)
    );
  } catch {
    return false;
  }
}

function queryElement(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function isElementInteractionReady(element: Element): boolean {
  if (!element.isConnected) return false;
  if (element.matches(':disabled, [aria-disabled="true"]')) return false;

  let current: Element | null = element;
  while (current) {
    if (
      current.matches(
        '[hidden], [inert], [aria-hidden="true"], [aria-busy="true"], [data-loading="true"]',
      )
    ) {
      return false;
    }

    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    current = current.parentElement;
  }

  return true;
}

function markerIsReady(): boolean {
  const anyMarker = queryElement(DESTINATION_READY_MARKER_SELECTOR);
  if (!anyMarker) return document.readyState !== 'loading';

  const readyMarker = queryElement(POSITIVE_DESTINATION_READY_MARKER_SELECTOR);
  return readyMarker !== null && isElementInteractionReady(readyMarker);
}

function destinationIsReady({
  destinationHref,
  readySelector,
  requiredControlSelector,
}: UseDestinationReadyOptions): boolean {
  const normalizedHref = destinationHref?.trim() ?? '';
  if (normalizedHref.length === 0 || !matchesCurrentDestination(normalizedHref)) return false;

  const normalizedReadySelector = readySelector?.trim() ?? '';
  if (normalizedReadySelector.length > 0) {
    const readyElement = queryElement(normalizedReadySelector);
    if (!readyElement || !isElementInteractionReady(readyElement)) return false;
  } else if (!markerIsReady()) {
    return false;
  }

  const normalizedControlSelector = requiredControlSelector?.trim() ?? '';
  if (normalizedControlSelector.length === 0) return true;

  const requiredControl = queryElement(normalizedControlSelector);
  return requiredControl !== null && isElementInteractionReady(requiredControl);
}

/**
 * Reports readiness only after the requested route and its required control or
 * explicit readiness marker are present and no longer busy in the live DOM.
 */
export function useDestinationReady({
  destinationHref,
  enabled = true,
  readySelector,
  requiredControlSelector,
}: UseDestinationReadyOptions): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- disabling must clear readiness from the previous destination
      setReady(false);
      return;
    }

    let active = true;
    let animationFrame: number | null = null;
    const requestFrame: (callback: FrameRequestCallback) => number =
      typeof window.requestAnimationFrame === 'function'
        ? (callback) => window.requestAnimationFrame(callback)
        : (callback) => window.setTimeout(() => callback(performance.now()), 0);
    const cancelFrame: (handle: number) => void =
      typeof window.cancelAnimationFrame === 'function'
        ? (handle) => window.cancelAnimationFrame(handle)
        : (handle) => window.clearTimeout(handle);

    setReady(false);

    const evaluate = () => {
      if (!active) return;
      const nextReady = destinationIsReady({
        destinationHref,
        readySelector,
        requiredControlSelector,
      });
      setReady((current) => (current === nextReady ? current : nextReady));
    };

    const scheduleEvaluation = () => {
      if (animationFrame !== null) return;
      animationFrame = requestFrame(() => {
        animationFrame = null;
        evaluate();
      });
    };

    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => scheduleEvaluation());
    mutationObserver?.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    window.addEventListener('load', scheduleEvaluation);
    window.addEventListener('popstate', scheduleEvaluation);
    window.addEventListener('hashchange', scheduleEvaluation);
    window.addEventListener(DESTINATION_READY_EVENT, scheduleEvaluation);
    document.addEventListener('readystatechange', scheduleEvaluation);
    scheduleEvaluation();

    return () => {
      active = false;
      mutationObserver?.disconnect();
      window.removeEventListener('load', scheduleEvaluation);
      window.removeEventListener('popstate', scheduleEvaluation);
      window.removeEventListener('hashchange', scheduleEvaluation);
      window.removeEventListener(DESTINATION_READY_EVENT, scheduleEvaluation);
      document.removeEventListener('readystatechange', scheduleEvaluation);
      if (animationFrame !== null) cancelFrame(animationFrame);
    };
  }, [destinationHref, enabled, readySelector, requiredControlSelector]);

  return ready;
}
