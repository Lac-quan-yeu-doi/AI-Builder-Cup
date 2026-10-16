const editChartRoute = /^\/analytics\/charts\/[^/]+\/edit$/u;

/** Returns whether the route is an authoring surface that owns the viewport. */
export function isFullscreenWorkspaceRoute(pathname: string): boolean {
  return (
    pathname === '/analytics/charts/new' ||
    pathname === '/charts/new' ||
    editChartRoute.test(pathname)
  );
}
