'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * Keeps a container's open tab in the URL.
 *
 * Extracted from the database screen, where four behaviours were worked out and
 * then copied by hand into the source screen. Each one is load-bearing:
 *
 * - An unrecognised `?tab=` falls back to the default rather than rendering an
 *   empty panel, so a hand-typed or stale link still lands somewhere.
 * - The default tab **deletes** the param instead of writing it, so a container
 *   has one canonical URL rather than two that render identically.
 * - Other query params survive, because a container is not the only thing that
 *   writes to the URL on its route.
 * - `replace`, not `push` — switching tabs is not a navigation worth a history
 *   entry — and `scroll: false`, so the page does not jump to the top.
 *
 * Copying that by hand is also how `?tab=sources` survived the stage being
 * removed: two links still point at a tab that no longer exists and silently
 * land on the default. `hrefForTab` below is the typed way to build one.
 */
export function useUrlTab<const Tabs extends readonly string[]>(
  tabs: Tabs,
  defaultTab: Tabs[number],
  paramName = 'tab',
): readonly [Tabs[number], (next: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = useMemo<Tabs[number]>(() => {
    const value = searchParams.get(paramName);
    return value !== null && (tabs as readonly string[]).includes(value)
      ? (value as Tabs[number])
      : defaultTab;
  }, [defaultTab, paramName, searchParams, tabs]);

  // Takes `string` rather than `Tabs[number]` so it can be handed straight to
  // Radix's `onValueChange`.
  const goToTab = useCallback(
    (next: string): void => {
      const query = new URLSearchParams(searchParams.toString());
      if (next === defaultTab) query.delete(paramName);
      else query.set(paramName, next);
      const search = query.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [defaultTab, paramName, pathname, router, searchParams],
  );

  return [active, goToTab];
}

/**
 * A link into one of a container's tabs.
 *
 * Typed against the container's own tab tuple, so a tab that is renamed or
 * removed turns every link to it into a compile error instead of a silent
 * fallback.
 */
export function hrefForTab<const Tabs extends readonly string[]>(
  base: string,
  tab: Tabs[number],
  tabs: Tabs,
  defaultTab: Tabs[number],
  paramName = 'tab',
): string {
  if (!(tabs as readonly string[]).includes(tab)) {
    throw new Error(`"${tab}" is not a tab of ${base}`);
  }
  return tab === defaultTab ? base : `${base}?${paramName}=${encodeURIComponent(tab)}`;
}
