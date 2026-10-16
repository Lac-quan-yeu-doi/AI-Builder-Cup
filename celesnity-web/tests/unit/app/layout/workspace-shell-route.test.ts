import { describe, expect, it } from 'vitest';

import { isFullscreenWorkspaceRoute } from '@/app/_components/layout/workspace-shell-route';
import {
  firstVisibleWorkspaceDestination,
  visibleWorkspaceNavigationGroups,
  workspaceFeatureForPath,
} from '@/app/_components/layout/workspace-navigation';

describe('isFullscreenWorkspaceRoute', () => {
  it.each(['/analytics/charts/new', '/analytics/charts/chart-1/edit', '/charts/new'])(
    'uses the fullscreen authoring shell for %s',
    (pathname) => {
      expect(isFullscreenWorkspaceRoute(pathname)).toBe(true);
    },
  );

  it.each(['/analytics', '/analytics/charts/chart-1', '/chat'])(
    'keeps the workspace shell for %s',
    (pathname) => {
      expect(isFullscreenWorkspaceRoute(pathname)).toBe(false);
    },
  );
});

describe('workspace feature navigation', () => {
  it('filters inaccessible items and removes empty sidebar headings', () => {
    const groups = visibleWorkspaceNavigationGroups(['HOME', 'ANALYTICS']);
    const labels = groups.flatMap((group) => group.items.map((item) => item.labelKey));
    // `HOME` backs the chat, skills and plugins destinations, which sit in
    // different groups, so this also covers a group surviving with some of its items.
    expect(labels).toEqual(['nav.chat', 'nav.analytics', 'nav.skills', 'nav.plugins']);
    expect(groups.every((group) => group.items.length > 0 || group.sections?.length)).toBe(true);
  });

  it('resolves direct nested routes to the feature policy checked by the shell', () => {
    expect(workspaceFeatureForPath('/analytics/charts/chart-1/edit')).toBe('ANALYTICS');
    expect(workspaceFeatureForPath('/charts/new')).toBe('ANALYTICS');
    expect(workspaceFeatureForPath('/scripts')).toBe('PIPELINES');
    expect(workspaceFeatureForPath('/databases/iceberg')).toBe('CATALOG_DATABASES');
  });

  it('lands on the first visible destination and supports an explicit no-feature policy', () => {
    expect(firstVisibleWorkspaceDestination(['ANALYTICS'])?.href).toBe('/analytics');
    expect(firstVisibleWorkspaceDestination([])).toBeUndefined();
  });

  it('still guards a route the sidebar no longer offers', () => {
    // Folding a destination into its container must not open it: an unmapped
    // path reads as "allowed" in the shell, so each one keeps an explicit entry.
    expect(workspaceFeatureForPath('/connections')).toBe('CONNECTIONS');
    expect(workspaceFeatureForPath('/devices')).toBe('DEVICES');
    expect(workspaceFeatureForPath('/executions')).toBe('EXECUTIONS');
  });
});
