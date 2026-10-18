import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { isPausedWorkspaceRoute, workspaceFeatureForPath } from '@/app/_components/layout/route-features';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const workspaceRoot = join(projectRoot, 'app', '(workspace)');

/**
 * Every route under `app/(workspace)/`, as a concrete pathname.
 *
 * Dynamic segments are substituted rather than skipped: a guard that only
 * matched `/databases` and missed `/databases/analytics` would be exactly the
 * hole this test exists to catch.
 */
function workspaceRoutes(dir: string, prefix: string): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (entry.name === 'page.tsx' && prefix !== '') routes.push(prefix);
      continue;
    }
    // Private folders and route groups add no path segment.
    if (entry.name.startsWith('_')) continue;
    const segment = entry.name.startsWith('(')
      ? ''
      : entry.name.startsWith('[')
        ? '/sample-id'
        : `/${entry.name}`;
    routes.push(...workspaceRoutes(join(dir, entry.name), `${prefix}${segment}`));
  }
  return routes;
}

describe('workspace route guards', () => {
  const routes = workspaceRoutes(workspaceRoot, '');

  it('finds the workspace route tree', () => {
    // A rename that silently emptied this list would make every assertion below
    // pass vacuously.
    expect(routes.length).toBeGreaterThan(20);
    expect(routes).toContain('/chat');
    expect(routes).toContain('/databases/sample-id');
  });

  it('guards every route, including those the sidebar does not offer', () => {
    // `undefined` reads as "allowed" in the shell, so an unmapped route is an
    // open one. Folding a destination into its container must not open it.
    const unguarded = routes.filter((route) => workspaceFeatureForPath(route) === undefined);
    expect(unguarded).toEqual([]);
  });

  it('prefers the more specific prefix', () => {
    expect(workspaceFeatureForPath('/catalog/tables')).toBe('CATALOG_TABLES');
    expect(workspaceFeatureForPath('/catalog/databases')).toBe('CATALOG_DATABASES');
    expect(workspaceFeatureForPath('/catalog')).toBe('CATALOG_DATABASES');
  });

  it('keeps guarding the parts folded into a container', () => {
    // These leave the sidebar but stay governed: an admin can still revoke them,
    // and Core still enforces them.
    expect(workspaceFeatureForPath('/connections')).toBe('CONNECTIONS');
    expect(workspaceFeatureForPath('/source-schema/abc')).toBe('SOURCE_SCHEMA');
    expect(workspaceFeatureForPath('/metadata-crawler/abc')).toBe('CRAWLER');
    expect(workspaceFeatureForPath('/pipelines')).toBe('PIPELINES');
    expect(workspaceFeatureForPath('/executions')).toBe('EXECUTIONS');
    expect(workspaceFeatureForPath('/devices')).toBe('DEVICES');
  });

  it('leaves paths outside the workspace unmapped', () => {
    expect(workspaceFeatureForPath('/login')).toBeUndefined();
    expect(workspaceFeatureForPath('/')).toBeUndefined();
  });

  it('does not match a route that merely shares a prefix string', () => {
    // `/skills` must not be matched by a hypothetical `/ski` entry, and
    // `/documents-archive` must not inherit `/documents`.
    expect(workspaceFeatureForPath('/documents-archive')).toBeUndefined();
  });

  it('pauses unrelated screens without pausing the six capability flows', () => {
    for (const path of ['/sql', '/scripts', '/skills', '/guide', '/administration']) {
      expect(isPausedWorkspaceRoute(path), path).toBe(true);
      expect(isPausedWorkspaceRoute(`${path}/nested`), `${path}/nested`).toBe(true);
    }
    for (const path of [
      '/chat',
      '/catalog/databases',
      '/streaming',
      '/plant-model',
      '/data-workflows',
      '/automations',
      '/analytics',
      '/documents',
      '/plugins/google-drive',
    ]) {
      expect(isPausedWorkspaceRoute(path), path).toBe(false);
    }
    expect(isPausedWorkspaceRoute('/sql-archive')).toBe(false);
  });
});
