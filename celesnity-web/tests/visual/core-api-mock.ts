import type { Page, Route } from '@playwright/test';

import * as fixtures from './fixtures';

interface CoreApiMockOptions {
  readonly showTutorialOnboarding?: boolean;
}

/**
 * Fulfils every Core API call from fixtures and blocks external asset hosts, so
 * the visual suite renders identically offline.
 */
export async function mockCoreApi(page: Page, options: CoreApiMockOptions = {}): Promise<void> {
  // Create a real local-development session so the server-side route guard is
  // exercised without contacting Identity Platform.
  const visualPort = process.env.PLAYWRIGHT_PORT ?? '3100';
  const visualOrigin = `http://127.0.0.1:${visualPort}`;
  const session = await page.request.post(`${visualOrigin}/api/auth/local-session`, {
    data: { persona: 'local-owner' },
    headers: { origin: visualOrigin },
  });
  if (session.status() !== 204) {
    throw new Error(`Visual test session creation failed with HTTP ${session.status()}.`);
  }
  await page.route('**/api/core/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/core/u, '');
    const body =
      request.method() === 'GET' &&
      path === '/tutorial-onboarding-decision' &&
      options.showTutorialOnboarding === true
        ? null
        : resolve(path, request.method(), url.searchParams, request.postDataJSON());

    if (body === undefined) {
      return route.fulfill({
        status: 404,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'Not Found', detail: `No fixture for ${path}` }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.route('**/api/agent/rooms', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/agent/agent-manifests**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );

  // The skills library. `/skills` had no visual baseline at all before the
  // 2026-09-16 redesign, so it had no fixture either — the page rendered its
  // empty state in every run that reached it.
  await page.route('**/api/agent/skills**', (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const match = /\/api\/agent\/skills\/([^/]+)$/u.exec(path);
    if (match) {
      const name = decodeURIComponent(match[1] ?? '');
      const summary = fixtures.skills.find((skill) => skill.name === name) ?? fixtures.skills[0];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...summary, body: fixtures.skillBody }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixtures.skills),
    });
  });

  // The chat landing shows a connection badge off this probe. Unmocked it fails
  // and the badge reads Offline, which makes the snapshot depend on whether a
  // container happens to be up.
  await page.route('**/api/agent/healthz', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }),
  );

  // SSE progress streams: keep them open and silent so the UI settles on its
  // first snapshot instead of animating.
  await page.route('**/progress**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }),
  );

  await page.route(
    /https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/u,
    (route: Route) => route.abort(),
  );
}

function resolve(
  path: string,
  method: string,
  query: URLSearchParams,
  requestBody: unknown,
): unknown {
  if (method === 'PUT' && path === '/tutorial-onboarding-decision') {
    if (!isRecord(requestBody) || typeof requestBody.decision !== 'string') return undefined;
    return { decision: requestBody.decision };
  }
  if (method === 'PUT' && /^\/tutorial-progress\/[^/]+$/u.test(path)) {
    if (!isRecord(requestBody)) return undefined;
    return {
      tutorialId: decodeURIComponent(path.split('/').at(-1) ?? ''),
      memberId: 'visual-test-user',
      organizationId: 'visual-test-organization',
      ...requestBody,
    };
  }
  if (method === 'PUT' && /^\/tutorial-runs\/[^/]+\/completion$/u.test(path)) {
    return {
      ...fixtures.tutorialCompletion,
      runId: decodeURIComponent(path.split('/').at(-2) ?? fixtures.tutorialCompletion.runId),
    };
  }
  if (method === 'POST' && /^\/catalogs\/[^/]+\/schemas$/u.test(path)) {
    return { catalog: 'iceberg', name: 'curated_sales' };
  }
  if (method === 'POST' && path === '/chart-authoring/previews') {
    return fixtures.chartPreview;
  }
  if (method === 'POST' && path === '/chart-authoring/query-previews') {
    return fixtures.chartPreview;
  }
  if (method === 'POST' && path === '/chart-authoring/query-compilations') {
    return fixtures.chartQueryCompilation;
  }
  if (method === 'POST' && path === '/chart-authoring/charts') {
    return fixtures.chartCreated;
  }
  if (method === 'POST' && /^\/chart-authoring\/charts\/[^/]+\/runs$/u.test(path)) {
    return fixtures.chartPreview;
  }
  if (method === 'POST' && path === `/dashboards/${fixtures.plantDashboardId}/execute`) {
    return {
      dashboard_id: fixtures.plantDashboardId,
      tab_id: 'dashboard-tab-1',
      cards: [
        { card_id: 'dashboard-card-1', state: 'SUCCESS', result: fixtures.chartPreview },
        { card_id: 'dashboard-card-2', state: 'SUCCESS', result: fixtures.chartPreview },
      ],
    };
  }
  if (method === 'POST' && path === '/plant-model-catalog-lookups') {
    return {
      success: true,
      data: {
        kind: 'choices',
        options: [
          { value: 'running', label: 'Running' },
          { value: 'maintenance', label: 'Maintenance' },
          { value: 'stopped', label: 'Stopped' },
        ],
        resolvedAt: '2026-09-12T00:00:00.000Z',
      },
    };
  }
  if (method === 'POST' && path === '/pipelines/validate') {
    return { success: true, data: { valid: true, errors: [], warnings: [] } };
  }
  if (method === 'PATCH' && /^\/catalogs\/[^/]+\/schemas\/[^/]+$/u.test(path)) {
    return { catalog: 'iceberg', name: decodeURIComponent(path.split('/').at(-1) ?? '') };
  }
  if (method !== 'GET') {
    return undefined;
  }

  if (path === '/tutorials') return fixtures.tutorialCatalog;
  if (path === '/tutorial-progress') return fixtures.tutorialProgress;
  if (path === '/tutorial-onboarding-decision') return { decision: 'DISMISSED' };
  if (path === '/tutorials/context-resources') return fixtures.tutorialContextResources;
  if (path === '/agent-manifests') return [];
  if (/^\/tutorials\/[^/]+$/u.test(path)) {
    const tutorialId = decodeURIComponent(path.split('/').at(-1) ?? '');
    return fixtures.tutorialDefinitions.find((definition) => definition.id === tutorialId);
  }

  // The node catalogue is queried once per category, so the fixture answers per
  // category rather than returning the same list three times.
  if (path === '/node-definitions') {
    return fixtures.nodeDefinitions(query.get('category') ?? undefined);
  }
  if (path === '/node-definitions/ICEBERG_TARGET') {
    return { success: true, data: fixtures.targetDefinitionDetail, meta: fixtures.responseMeta };
  }

  const table = [
    ['/administration/me', fixtures.administrationSession],
    ['/administration/memberships', fixtures.organizationMembers],
    ['/administration/authorization/groups', fixtures.authorizationGroups],
    ['/administration/authorization/catalog-grants', fixtures.catalogAccessGrants],
    ['/administration/authorization/service-identities', []],
    ['/database-services', fixtures.databaseServices],
    ['/database-service-connectors', fixtures.databaseServiceConnectors],
    ['/metadata-crawlers', { items: [], total: 0 }],
    ['/metadata-crawler-database-services', []],
    ['/scripts', fixtures.scripts],
    ['/executions', fixtures.executions],
    ['/data-workflows', fixtures.dataWorkflows],
    ['/catalogs', fixtures.catalogs],
    ['/sql-executions', fixtures.queryHistory],
    ['/pipelines', fixtures.pipelineCollection],
    ['/node-categories', fixtures.nodeCategories],
    ['/streaming/mqtt-adapters', fixtures.mqttStreamAdapters],
    ['/device-management/devices', fixtures.devices],
    ['/device-management/firmware-releases', fixtures.firmwareReleases],
    ['/device-management/firmware-campaigns', fixtures.firmwareCampaigns],
    ['/device-management/device-alerts', fixtures.deviceAlerts],
    ['/device-management/device-configuration-templates', fixtures.deviceConfigurationTemplates],
    ['/chart-collections', fixtures.chartCollections],
  ] as const;

  for (const [route, value] of table) {
    if (path === route) {
      return value;
    }
  }

  if (/^\/database-services\/[^/]+$/u.test(path)) return fixtures.connections[0];
  if (/^\/scripts\/[^/]+$/u.test(path)) return fixtures.scripts[0];
  if (/^\/scripts\/[^/]+\/versions$/u.test(path)) return fixtures.scriptVersions;
  if (/^\/scripts\/[^/]+\/versions\/[^/]+\/source$/u.test(path)) return fixtures.scriptSource;
  if (/^\/executions\/[^/]+$/u.test(path)) return fixtures.executions[0];
  if (/^\/executions\/[^/]+\/logs$/u.test(path)) return fixtures.executionLog;
  if (/^\/catalogs\/[^/]+\/schemas$/u.test(path)) return fixtures.namespaces;
  if (/^\/catalogs\/[^/]+\/schemas\/[^/]+\/tables$/u.test(path)) return fixtures.tables;
  if (/\/tables\/[^/]+\/columns$/u.test(path)) return fixtures.tableMetadata;
  if (/\/tables\/[^/]+\/snapshots$/u.test(path)) return fixtures.tableSnapshots;
  if (/\/tables\/[^/]+\/preview$/u.test(path)) return fixtures.tablePreview;
  if (/^\/sql-executions\/[^/]+$/u.test(path)) return fixtures.querySucceededDetail;
  if (path === '/chart-authoring/charts') return [fixtures.chartCreated];
  if (path === '/chart-authoring/charts/chart-manual-1') return fixtures.chartCreated;
  if (path === '/chart-authoring/charts/chart-manual-1/revisions') return [];
  if (/^\/pipelines\/[^/]+$/u.test(path)) return fixtures.pipelineDetail;
  if (/^\/plant-sites\/[^/]+\/model$/u.test(path)) {
    return { success: true, data: fixtures.plantSite };
  }
  if (/^\/plant-sites\/[^/]+\/dashboards$/u.test(path)) {
    return { success: true, data: [fixtures.plantDashboardAssociation] };
  }
  if (path === `/dashboards/${fixtures.plantDashboardId}`) return fixtures.plantDashboard;
  if (path === '/dashboards' && query.get('collection_id') === fixtures.chartCollections[0]!.id)
    return [fixtures.plantDashboardSummary];
  if (/^\/device-management\/devices\/[^/]+\/firmware-deployments$/u.test(path)) {
    return fixtures.firmwareDeployments;
  }
  if (/^\/device-management\/devices\/[^/]+\/configurations$/u.test(path)) {
    return fixtures.deviceConfigurations;
  }
  if (/^\/device-management\/devices\/[^/]+\/logs$/u.test(path)) {
    return fixtures.deviceLogs;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
