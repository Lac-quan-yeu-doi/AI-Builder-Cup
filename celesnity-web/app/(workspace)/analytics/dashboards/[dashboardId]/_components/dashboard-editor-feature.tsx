'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getInjection } from '@/di/container';
import { ConflictError } from '@/src/entities/errors/application-errors';
import type { ChartSummary } from '@/src/entities/models/canonical-chart';
import type { DashboardFilterTargetOption } from '@/src/entities/models/dashboard-runtime';
import type {
  Dashboard,
  DashboardCard,
  DashboardFilter,
  DashboardFilterMapping,
  DashboardTab,
} from '@/src/entities/models/dashboard';
import { DashboardEditorScreen } from './dashboard-editor-screen';
import { createDashboardEditorState, dashboardEditorReducer } from './dashboard-editor-state';

const getDashboard = getInjection('GetDashboardController');
const saveDashboard = getInjection('SaveDashboardController');
const copyDashboard = getInjection('CopyDashboardController');
const listCharts = getInjection('ListCanonicalChartsController');
const listFilterTargets = getInjection('ListDashboardFilterTargetsController');

export function DashboardEditorFeature({ dashboardId }: { readonly dashboardId: string }) {
  const [loaded, setLoaded] = useState<Dashboard | null>(null);
  const [charts, setCharts] = useState<readonly ChartSummary[]>([]);
  const [filterTargets, setFilterTargets] = useState<readonly DashboardFilterTargetOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getDashboard(dashboardId)
      .then(async (dashboard) => {
        const [summaries, targets] = await Promise.all([
          listCharts(dashboard.collectionId),
          listFilterTargets(dashboard.id),
        ]);
        if (!active) return;
        setLoaded(dashboard);
        setCharts(summaries);
        setFilterTargets(targets);
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(messageOf(reason));
      });
    return () => {
      active = false;
    };
  }, [dashboardId]);

  if (!loaded) {
    return (
      <main className="p-8 text-body-sm text-muted-foreground">
        {loadError ? (
          <span role="alert" className="text-destructive">
            {loadError}
          </span>
        ) : (
          'Loading dashboard editor…'
        )}
      </main>
    );
  }

  return <LoadedDashboardEditor dashboard={loaded} charts={charts} filterTargets={filterTargets} />;
}

function LoadedDashboardEditor({
  dashboard,
  charts,
  filterTargets,
}: {
  readonly dashboard: Dashboard;
  readonly charts: readonly ChartSummary[];
  readonly filterTargets: readonly DashboardFilterTargetOption[];
}) {
  const [state, dispatch] = useReducer(
    dashboardEditorReducer,
    dashboard,
    createDashboardEditorState,
  );
  const [draftFilterTargets, setDraftFilterTargets] = useState(filterTargets);
  const router = useRouter();
  const viewPath = `/analytics/dashboards/${encodeURIComponent(dashboard.id)}`;
  const chartCards = useMemo(
    () =>
      state.draft.cards.flatMap((card) =>
        card.kind === 'CHART' ? [{ cardId: card.id, chartId: card.chartId }] : [],
      ),
    [state.draft.cards],
  );

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void listFilterTargets({ dashboardId: dashboard.id, chartCards })
        .then((targets) => {
          if (active) setDraftFilterTargets(targets);
        })
        .catch(() => {
          // Keep the last authorized target list; saving still validates mappings in Core.
        });
    });
    return () => {
      active = false;
    };
  }, [dashboard.id, chartCards]);

  async function save(): Promise<void> {
    dispatch({ type: 'save-started' });
    try {
      const saved = await saveDashboard(state.draft);
      dispatch({ type: 'save-succeeded', dashboard: saved });
      router.push(viewPath);
    } catch (reason: unknown) {
      dispatch({
        type: 'save-failed',
        message: messageOf(reason),
        conflict: reason instanceof ConflictError,
      });
    }
  }

  return (
    <DashboardEditorScreen
      state={state}
      charts={charts}
      filterTargets={draftFilterTargets}
      onRename={(name, description) => dispatch({ type: 'rename', name, description })}
      onAddCard={(card) => dispatch({ type: 'add-card', card })}
      onUpdateCard={(card) => dispatch({ type: 'update-card', card })}
      onRemoveCard={(cardId) => dispatch({ type: 'remove-card', cardId })}
      onAddTab={(tab) => dispatch({ type: 'add-tab', tab })}
      onUpdateTab={(tab) => dispatch({ type: 'update-tab', tab })}
      onRemoveTab={(tabId) => dispatch({ type: 'remove-tab', tabId })}
      onAddFilter={(filter) => dispatch({ type: 'add-filter', filter })}
      onUpdateFilter={(filter) => dispatch({ type: 'update-filter', filter })}
      onReplaceFilterMappings={(filterId, mappings) =>
        dispatch({ type: 'replace-filter-mappings', filterId, mappings })
      }
      onRemoveFilter={(filterId) => dispatch({ type: 'remove-filter', filterId })}
      onCancel={() => {
        // Confirming a discard is the editor's own job now; it owns the dialog
        // and knows whether there is anything to discard.
        dispatch({ type: 'cancel' });
        router.push(viewPath);
      }}
      onSave={() => void save()}
      onReload={() => {
        void getDashboard(dashboard.id).then((fresh) =>
          dispatch({ type: 'reload', dashboard: fresh }),
        );
      }}
      onSaveAsCopy={(name) => {
        void copyDashboard({
          sourceDashboardId: dashboard.id,
          collectionId: state.draft.collectionId,
          name,
          draft: state.draft,
        }).then((copy) => router.push(`/analytics/dashboards/${encodeURIComponent(copy.id)}/edit`));
      }}
    />
  );
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Unable to save dashboard.';
}

export type DashboardEditorCardHandler = (card: DashboardCard) => void;
export type DashboardEditorFilterHandler = (filter: DashboardFilter) => void;
export type DashboardEditorMappingsHandler = (
  filterId: string,
  mappings: readonly DashboardFilterMapping[],
) => void;
export type DashboardEditorTabHandler = (tab: DashboardTab) => void;
