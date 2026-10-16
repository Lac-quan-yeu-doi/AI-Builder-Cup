import type { WorkspaceFeature } from '@/src/entities/models/workspace-feature';

/**
 * Which feature guards which route.
 *
 * This used to be derived from the sidebar: `workspaceFeatureForPath` scanned
 * `workspaceNavigation` for an item whose `href` prefixed the path. That coupling
 * had a failure mode pointing the wrong way — a path matching no nav item
 * returned `undefined`, and `workspace-shell.tsx` reads `undefined` as
 * *allowed*. So removing an entry from the sidebar removed that route's guard
 * and opened it to everyone, which is the opposite of what taking a destination
 * out of the navigation looks like it should do.
 *
 * Three routes already had to be special-cased for exactly this reason
 * (`/databases/`, `/scripts`, `/charts`) because they are reachable without
 * being destinations. Folding parts into their container turns most of the
 * sidebar into that case, so the mapping is stated in full here instead.
 *
 * Longest prefix wins, so `/catalog/tables` is matched before `/catalog`.
 */
const ROUTE_FEATURES: readonly (readonly [string, WorkspaceFeature])[] = [
  ['/chat', 'HOME'],
  ['/skills', 'HOME'],
  ['/plugins', 'HOME'],

  // Data Catalog — the database container and everything reached inside it.
  ['/catalog/tables', 'CATALOG_TABLES'],
  ['/catalog/databases', 'CATALOG_DATABASES'],
  ['/catalog', 'CATALOG_DATABASES'],
  ['/databases', 'CATALOG_DATABASES'],

  // Parts of the database flow. Each keeps its own feature even though the
  // sidebar no longer offers it: the policy still governs it, and an admin can
  // still revoke it.
  ['/connections', 'CONNECTIONS'],
  ['/source-schema', 'SOURCE_SCHEMA'],
  ['/metadata-crawler', 'CRAWLER'],
  ['/pipelines', 'PIPELINES'],
  ['/data-workflows', 'PIPELINES'],
  ['/scripts', 'PIPELINES'],
  ['/executions', 'EXECUTIONS'],

  // Streaming container, and the devices filed under one of its adapters.
  ['/streaming', 'STREAMING'],
  ['/devices', 'DEVICES'],

  ['/plant-model', 'PLANT_MODEL'],
  ['/sql', 'QUERY'],
  ['/analytics', 'ANALYTICS'],
  ['/charts', 'ANALYTICS'],
  ['/automations', 'AUTOMATIONS'],
  ['/documents', 'DOCUMENTS'],
  ['/guide', 'GUIDE'],
  ['/administration', 'ADMINISTRATION'],
];

/** Sorted once, longest first, so a more specific prefix always wins. */
const BY_SPECIFICITY = [...ROUTE_FEATURES].sort((left, right) => right[0].length - left[0].length);

/**
 * The feature a route requires, or `undefined` for a path outside the workspace.
 *
 * `undefined` still reads as "allowed" at the call site, which is correct for
 * `/login` and friends — but `route-features.test.ts` asserts every route under
 * `app/(workspace)/` matches an entry here, so a new screen cannot reach that
 * branch by accident.
 */
export function workspaceFeatureForPath(pathname: string): WorkspaceFeature | undefined {
  const match = BY_SPECIFICITY.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match?.[1];
}

/** Every prefix this table guards — the test walks the route tree against it. */
export const guardedRoutePrefixes: readonly string[] = ROUTE_FEATURES.map(([prefix]) => prefix);
