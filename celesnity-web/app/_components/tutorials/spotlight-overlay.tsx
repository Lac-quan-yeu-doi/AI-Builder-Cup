'use client';
import { useEffect, useId, useState } from 'react';
import {
  type TargetControlStatus,
  useTargetControl,
} from '@/app/_components/tutorials/use-target-control';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export type SpotlightTargetStatusChange = (status: TargetControlStatus, retry: () => void) => void;
export interface SpotlightOverlayProps {
  readonly targetSelector: string | null | undefined;
  readonly targetDescription: string;
  readonly enabled?: boolean;
  readonly targetTimeoutMs?: number;
  readonly onTargetStatusChange?: SpotlightTargetStatusChange;
}
function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);
  return prefersReducedMotion;
}
function hasVisibleArea(rect: DOMRectReadOnly | null): rect is DOMRectReadOnly {
  return rect !== null && rect.width > 0 && rect.height > 0;
}
/**
 * Dims the Workspace around the live target, following the familiar cloud
 * console walkthrough treatment. The SVG never accepts pointer input, so the
 * original target remains stateful and fully operable through the cutout.
 */
export function SpotlightOverlay({
  targetSelector,
  targetDescription,
  enabled = true,
  targetTimeoutMs,
  onTargetStatusChange,
}: SpotlightOverlayProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const descriptionId = `spotlight-${useId().replaceAll(':', '')}`;
  const target = useTargetControl({
    selector: targetSelector,
    enabled,
    timeoutMs: targetTimeoutMs,
    scrollBehavior: prefersReducedMotion ? 'auto' : 'smooth',
  });
  const maskId = `${descriptionId}-mask`;
  const description = targetDescription.trim();
  useEffect(() => {
    onTargetStatusChange?.(target.status, target.retry);
  }, [onTargetStatusChange, target.retry, target.status]);
  useEffect(() => {
    if (target.status !== 'ready' || !target.element || description.length === 0) return;
    const existingIds =
      target.element.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
    if (!existingIds.includes(descriptionId)) {
      target.element.setAttribute('aria-describedby', [...existingIds, descriptionId].join(' '));
    }
    return () => {
      if (!target.element) return;
      const remainingIds =
        target.element
          .getAttribute('aria-describedby')
          ?.split(/\s+/)
          .filter((id) => id.length > 0 && id !== descriptionId) ?? [];
      if (remainingIds.length > 0) {
        target.element.setAttribute('aria-describedby', remainingIds.join(' '));
      } else {
        target.element.removeAttribute('aria-describedby');
      }
    };
  }, [description, descriptionId, target.element, target.status]);
  if (
    !enabled ||
    target.status !== 'ready' ||
    !hasVisibleArea(target.rect) ||
    description.length === 0
  ) {
    return null;
  }
  return (
    <>
      <svg
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-40 h-dvh w-full opacity-100 transition-opacity duration-200 motion-reduce:duration-0 motion-reduce:transition-none"
        data-spotlight-overlay=""
        focusable="false"
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect fill="white" x="0" y="0" width="100%" height="100%" />
            <rect
              fill="black"
              height={target.rect.height + 8}
              rx="6"
              width={target.rect.width + 8}
              x={target.rect.left - 4}
              y={target.rect.top - 4}
            />
          </mask>
        </defs>
        <rect
          className="fill-foreground/45"
          data-spotlight-dimmer=""
          height="100%"
          mask={`url(#${maskId})`}
          width="100%"
        />
        <rect
          className="fill-none stroke-ring"
          data-spotlight-cutout="target"
          height={target.rect.height + 8}
          rx="6"
          strokeWidth="3"
          width={target.rect.width + 8}
          x={target.rect.left - 4}
          y={target.rect.top - 4}
        />
      </svg>
      <span
        id={descriptionId}
        className="sr-only"
        role="status"
        aria-atomic="true"
        aria-live="polite"
      >
        {description}
      </span>
    </>
  );
}
