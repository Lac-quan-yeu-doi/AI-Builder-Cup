import type { ReactNode } from 'react';

import { cn } from '@/app/_components/ui/utils';

export type PageWidth = 'wide' | 'full';

interface PageContainerProps {
  readonly children: ReactNode;
  /**
   * `wide` is the reading-width column every list and form screen uses.
   * `full` hands the screen the whole viewport — for canvases and explorers
   * that manage their own scrolling.
   */
  readonly width?: PageWidth;
}

// Only the narrow layout still puts a bar above the content: above 761px the
// shell is a sidebar, so a full-height screen owns the whole viewport. Getting
// this wrong leaves a canvas 56px short of the fold with no visible cause.
//
// `overflow-hidden` seals this box at exactly that height regardless of what
// the shell's own flex chain does above it — without it, a flex item's
// automatic minimum size is based on its content, so a tall enough screen
// (e.g. a long run-history list) can push this div, and the whole page, a few
// pixels past the viewport, turning the intended single inner scrollbar into
// a second, whole-page one. A `full` screen already manages its own internal
// scrolling, so nothing here ever needs to overflow this box outward.
const widthClass: Readonly<Record<PageWidth, string>> = {
  wide: 'mx-auto w-full max-w-[1400px] px-6 py-8 min-[1081px]:px-10',
  full: 'h-[calc(100vh-3.5rem)] w-full overflow-hidden md:h-screen',
};

/**
 * The shell owns no horizontal padding or max-width, so each page states how
 * much room it wants. Keeping that decision here rather than in every screen
 * means one place to change the reading width.
 */
export function PageContainer({ children, width = 'wide' }: PageContainerProps) {
  return <div className={cn(widthClass[width])}>{children}</div>;
}
