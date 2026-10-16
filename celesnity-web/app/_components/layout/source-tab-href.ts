import { hrefForTab } from './use-url-tab';

export const SOURCE_TABS = ['connection', 'scan', 'tables'] as const;
export const SOURCE_DEFAULT_TAB = 'connection';

/**
 * A link into one of a source's tabs, typed against `SOURCE_TABS`.
 *
 * App-wide rather than route-local: the source list and the scan summary both
 * link here, and they live in `app/_components/`. A route's `_components`
 * folder is private to that route, so reaching into it from outside was the
 * kind of import `frameworks-layer.test.ts` exists to stop.
 *
 * The database container's equivalent existed only after two links spent three
 * weeks pointing at a tab that had been removed. Same shape here, for the same
 * reason.
 */
export function sourceTabHref(
  database: string,
  sourceId: string,
  tab: (typeof SOURCE_TABS)[number],
): string {
  return hrefForTab(
    `/databases/${encodeURIComponent(database)}/sources/${encodeURIComponent(sourceId)}`,
    tab,
    SOURCE_TABS,
    SOURCE_DEFAULT_TAB,
  );
}
