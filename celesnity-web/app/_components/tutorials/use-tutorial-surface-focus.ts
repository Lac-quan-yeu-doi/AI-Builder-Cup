'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';

const WORKSPACE_FOCUS_FALLBACK_SELECTOR =
  '[data-workspace-heading], main h1, nav a[href], nav button:not(:disabled)';

function focusWorkspaceFallback(): void {
  const fallback = document.querySelector<HTMLElement>(WORKSPACE_FOCUS_FALLBACK_SELECTOR);
  if (!fallback) return;

  if (!fallback.matches('a[href], button, input, select, textarea, [tabindex]')) {
    fallback.tabIndex = -1;
  }
  fallback.focus();
}

/**
 * Moves focus into an opened tutorial surface once its initial control exists,
 * then restores the opener (or a stable Workspace fallback) when it closes.
 */
export function useTutorialSurfaceFocus(
  initialFocusRef: RefObject<HTMLElement | null>,
  ready = true,
): void {
  const openerRef = useRef<HTMLElement | null>(null);
  const movedInitialFocusRef = useRef(false);

  useLayoutEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      const opener = openerRef.current;
      if (opener?.isConnected) {
        opener.focus();
      } else {
        focusWorkspaceFallback();
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!ready || movedInitialFocusRef.current || !initialFocusRef.current) return;

    initialFocusRef.current.focus();
    movedInitialFocusRef.current = true;
  }, [initialFocusRef, ready]);
}
