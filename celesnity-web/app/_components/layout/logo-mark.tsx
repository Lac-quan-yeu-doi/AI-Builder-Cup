import type { ReactElement } from 'react';

/**
 * The Celesnity mark: two crossing orbits and a four-point star.
 *
 * Inline rather than the previous `logo.png` because the shell renders it at
 * 26px, where a 256px bitmap is resampled every paint — and because the navy
 * plate is part of the artwork, so it cannot read `currentColor` like the
 * glyphs in `ui/icons`.
 */
export function LogoMark({
  className,
  size = 26,
}: {
  readonly className?: string;
  readonly size?: number;
}): ReactElement {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      focusable="false"
      height={size}
      viewBox="0 0 256 256"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="var(--brand-mark-plate)" height="256" width="256" />
      <g fill="none" stroke="var(--brand-mark-ink)" strokeWidth="3.8">
        <ellipse cx="128" cy="127" rx="31" ry="85" transform="rotate(42 128 127)" />
        <ellipse cx="131" cy="129" rx="40" ry="78" transform="rotate(58 131 129)" />
      </g>
      <path
        d="M 145 122 Q 148 155 181 158 Q 148 161 145 194 Q 142 161 109 158 Q 142 155 145 122 Z"
        fill="var(--brand-mark-ink)"
      />
    </svg>
  );
}
