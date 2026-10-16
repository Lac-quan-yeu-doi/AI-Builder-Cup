'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from './pagination';
import { cn } from './utils';

interface PagerProps {
  /** Names the pager, e.g. "Pipeline pages". */
  readonly ariaLabel?: string;
  /** How many numbered pages to show around the current one. */
  readonly siblings?: number;
  readonly onChange: (page: number) => void;
  /** 1-based index of the page being shown. */
  readonly page: number;
  readonly total: number;
}

/**
 * Page picker for a long list, composed from shadcn/ui's `Pagination` parts.
 *
 * The primitives are anchors by design — they suit a URL-driven pager. This
 * list pages in place, so every control is a real `<button>`: an `<a href="#">`
 * would offer middle-click and "open in new tab" that lead nowhere.
 */
export function Pager({
  ariaLabel = 'Pagination',
  onChange,
  page,
  siblings = 1,
  total,
}: PagerProps) {
  if (total <= 1) {
    return null;
  }

  return (
    <Pagination aria-label={ariaLabel}>
      <PaginationContent>
        <PaginationItem>
          {/* `PaginationPrevious` supplies its own children, which leaves no
              room for `asChild`; the arrow and the label are spelled out here. */}
          <PaginationLink
            asChild
            size="default"
            className={cn('gap-1 px-2.5 sm:pl-2.5', page <= 1 && 'pointer-events-none opacity-50')}
          >
            <button
              disabled={page <= 1}
              onClick={() => onChange(page - 1)}
              type="button"
              aria-label="Previous page"
            >
              <ChevronLeftIcon />
              <span className="hidden sm:block">Previous</span>
            </button>
          </PaginationLink>
        </PaginationItem>

        {pageItems(page, total, siblings).map((item, index) =>
          item === 'gap' ? (
            <PaginationItem key={`gap-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink asChild isActive={item === page}>
                <button
                  onClick={() => onChange(item)}
                  type="button"
                  aria-current={item === page ? 'page' : undefined}
                  aria-label={`Page ${item}`}
                >
                  {item}
                </button>
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PaginationLink
            asChild
            size="default"
            className={cn(
              'gap-1 px-2.5 sm:pr-2.5',
              page >= total && 'pointer-events-none opacity-50',
            )}
          >
            <button
              disabled={page >= total}
              onClick={() => onChange(page + 1)}
              type="button"
              aria-label="Next page"
            >
              <span className="hidden sm:block">Next</span>
              <ChevronRightIcon />
            </button>
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

/** First page, last page, the current window, and gaps for everything else. */
function pageItems(page: number, total: number, siblings: number): readonly (number | 'gap')[] {
  const shown = new Set<number>([1, total]);
  for (let offset = -siblings; offset <= siblings; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 1 && candidate <= total) {
      shown.add(candidate);
    }
  }

  const items: (number | 'gap')[] = [];
  let previous = 0;
  for (const current of [...shown].sort((a, b) => a - b)) {
    if (previous && current - previous > 1) {
      items.push('gap');
    }
    items.push(current);
    previous = current;
  }
  return items;
}
