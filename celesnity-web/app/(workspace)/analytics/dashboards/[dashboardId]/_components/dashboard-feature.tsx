'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { getInjection } from '@/di/container';
import { useAnalyticsRecentsStore } from '@/app/_stores/analytics-recents.store';
import type { Dashboard } from '@/src/entities/models/dashboard';
import { readDashboardFilterValues, writeDashboardFilterValue } from './dashboard-filter-controls';
import { createDashboardRuntimeState, dashboardRuntimeReducer } from './dashboard-runtime-state';
import { useLiveDemoRuntime } from './live-demo-runtime';
import { DashboardScreen } from './dashboard-screen';

const getDashboard = getInjection('GetDashboardController');
const executeDashboard = getInjection('ExecuteDashboardController');

export function DashboardFeature({
  dashboardId,
  standalone = false,
  liveDemo = false,
}: {
  readonly dashboardId: string;
  /** True on /analytics/dashboards/[id], false when embedded in another page. */
  readonly standalone?: boolean;
  /**
   * Drift the numbers so a recorded demo looks live. Presentation only — the
   * executed values are untouched, and every other surface showing this same
   * dashboard still renders exactly what Core returned. See
   * `live-demo-jitter.ts`.
   */
  readonly liveDemo?: boolean;
}) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // What the library leads with. Recording it on open rather than on save is
  // the point: the strongest ranking signal here is what you looked at.
  useEffect(() => {
    void useAnalyticsRecentsStore.persist
      .rehydrate()
      ?.then(() => useAnalyticsRecentsStore.getState().noteObject(dashboardId, 'DASHBOARD'));
  }, [dashboardId]);

  useEffect(() => {
    let active = true;
    void getDashboard(dashboardId)
      .then((value) => {
        if (active) setDashboard(value);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Unable to load dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dashboardId]);

  if (!dashboard) {
    return (
      <DashboardScreen
        standalone={standalone}
        dashboard={dashboard}
        loading={loading}
        error={error}
        runtime={{ cards: {} }}
        filterValues={{}}
        onFilterChange={() => undefined}
        onRetryCard={() => undefined}
      />
    );
  }
  return <LoadedDashboard dashboard={dashboard} standalone={standalone} liveDemo={liveDemo} />;
}

function LoadedDashboard({
  dashboard,
  standalone,
  liveDemo,
}: {
  readonly dashboard: Dashboard;
  readonly standalone: boolean;
  /** Presentation-only drift for the embedded demo board. */
  readonly liveDemo: boolean;
}) {
  const orderedTabs = useMemo(
    () => [...dashboard.tabs].sort((left, right) => left.order - right.order),
    [dashboard.tabs],
  );
  const [activeTabId, setActiveTabId] = useState(orderedTabs[0]?.id ?? '');
  const tab = orderedTabs.find((item) => item.id === activeTabId) ?? orderedTabs[0];
  const chartCards = useMemo(
    () => dashboard.cards.filter((card) => card.kind === 'CHART' && card.tabId === tab?.id),
    [dashboard.cards, tab?.id],
  );
  const [runtime, dispatchRuntime] = useReducer(
    dashboardRuntimeReducer,
    chartCards.map((card) => card.id),
    createDashboardRuntimeState,
  );
  /* Presentation-only drift; the reducer above keeps the executed values. */
  const displayedRuntime = useLiveDemoRuntime(runtime, { enabled: liveDemo });
  const [filterValues, setFilterValues] = useState<Readonly<Record<string, unknown>>>(() =>
    Object.fromEntries(dashboard.filters.map((filter) => [filter.id, filter.defaultValue])),
  );
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const cardRequest = useRef<Record<string, number>>({});

  const execute = useCallback(
    async (
      values: Readonly<Record<string, unknown>>,
      changedFilterIds?: readonly string[],
      retryCardId?: string,
    ) => {
      if (!tab) return;
      const affected = retryCardId
        ? [retryCardId]
        : changedFilterIds
          ? dashboard.mappings
              .filter(
                (mapping) =>
                  changedFilterIds.includes(mapping.filterId) &&
                  chartCards.some((card) => card.id === mapping.cardId),
              )
              .map((mapping) => mapping.cardId)
          : chartCards.map((card) => card.id);
      const affectedCardIds = [...new Set(affected)];
      const requestId = ++requestSequence.current;
      for (const cardId of affectedCardIds) cardRequest.current[cardId] = requestId;
      dispatchRuntime({ type: 'started', cardIds: affectedCardIds });
      setRuntimeError(null);
      try {
        const valuesBySlug = Object.fromEntries(
          dashboard.filters.map((filter) => [filter.slug, values[filter.id]]),
        );
        const result = await executeDashboard({
          dashboardId: dashboard.id,
          tabId: tab.id,
          values: valuesBySlug,
          ...(changedFilterIds ? { changedFilterIds } : {}),
        });
        dispatchRuntime({
          type: 'resolved',
          cards: result.cards.filter((card) => cardRequest.current[card.cardId] === requestId),
        });
      } catch (reason: unknown) {
        setRuntimeError(
          reason instanceof Error ? reason.message : 'Unable to load dashboard cards.',
        );
      }
    },
    [chartCards, dashboard.filters, dashboard.id, dashboard.mappings, tab],
  );

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const initial = readDashboardFilterValues(dashboard.filters, window.location.search);
      setFilterValues(initial);
      dispatchRuntime({ type: 'reset', cardIds: chartCards.map((card) => card.id) });
      void execute(initial);
    });
    return () => {
      active = false;
    };
  }, [chartCards, dashboard.filters, execute]);

  useEffect(() => {
    const restore = () => {
      const restored = readDashboardFilterValues(dashboard.filters, window.location.search);
      setFilterValues(restored);
      void execute(restored);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [dashboard.filters, execute]);

  function changeFilter(filterId: string, value: unknown): void {
    const filter = dashboard.filters.find((item) => item.id === filterId);
    if (!filter) return;
    const next = { ...filterValues, [filterId]: value };
    const search = writeDashboardFilterValue(window.location.search, filter, value);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`);
    setFilterValues(next);
    void execute(next, [filterId]);
  }

  return (
    <DashboardScreen
      standalone={standalone}
      dashboard={dashboard}
      loading={false}
      error={runtimeError}
      runtime={displayedRuntime}
      filterValues={filterValues}
      activeTabId={tab?.id}
      onTabChange={setActiveTabId}
      onFilterChange={changeFilter}
      onRetryCard={(cardId) => void execute(filterValues, undefined, cardId)}
      onRefresh={() => void execute(filterValues)}
    />
  );
}
