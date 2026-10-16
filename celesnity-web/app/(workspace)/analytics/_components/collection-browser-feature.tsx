'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getInjection } from '@/di/container';
import type { ChartCollection } from '@/src/entities/models/chart-collection';
import type { ChartSummary } from '@/src/entities/models/canonical-chart';
import type { DashboardSummary } from '@/src/entities/models/dashboard';
import { useAnalyticsRecentsStore } from '@/app/_stores/analytics-recents.store';
import { CollectionBrowserScreen } from './collection-browser-screen';

const listCollections = getInjection('ListChartCollectionsController');
const createCollection = getInjection('CreateChartCollectionController');
const updateCollection = getInjection('UpdateChartCollectionController');
const moveCollection = getInjection('MoveChartCollectionController');
const archiveCollection = getInjection('ArchiveChartCollectionController');
const listCharts = getInjection('ListCanonicalChartsController');
const listDashboards = getInjection('ListDashboardsController');
const createDashboard = getInjection('CreateDashboardController');

export function CollectionBrowserFeature({
  selectedCollectionId,
}: {
  readonly selectedCollectionId?: string;
}) {
  const [collections, setCollections] = useState<readonly ChartCollection[]>([]);
  const [charts, setCharts] = useState<readonly ChartSummary[]>([]);
  const [dashboards, setDashboards] = useState<readonly DashboardSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Which collection the state above actually describes. Derived rather than a
  // `loading` flag set at the top of the effect: setting state synchronously in
  // an effect body cascades renders, and React's lint rule says so. Without it
  // the screen rendered "This collection is empty" for the second the first
  // fetch takes, which reads as an answer rather than as a wait.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = loadedFor !== (selectedCollectionId ?? '');
  const router = useRouter();
  // Rehydrated in an effect rather than at import: the first client render has
  // to match the server's, which knows nothing about this browser.
  const recentObjects = useAnalyticsRecentsStore((state) => state.objects);
  useEffect(() => {
    void useAnalyticsRecentsStore.persist.rehydrate();
  }, []);
  const recentIds = useMemo(() => recentObjects.map((entry) => entry.id), [recentObjects]);

  async function runMutation<T>(
    operation: () => Promise<T>,
    commit: (value: T) => void,
  ): Promise<boolean> {
    setError(null);
    try {
      commit(await operation());
      return true;
    } catch (reason: unknown) {
      setError(messageOf(reason));
      return false;
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const [value, chartValue] = await Promise.all([
        listCollections(),
        listCharts(selectedCollectionId),
      ]);
      const activeCollection =
        value.find((collection) => collection.id === selectedCollectionId) ??
        value.find((collection) => collection.kind === 'ROOT') ??
        value.find((collection) => collection.kind === 'PERSONAL');
      const dashboardValue = activeCollection ? await listDashboards(activeCollection.id) : [];
      return { value, chartValue, dashboardValue };
    })()
      .then(({ value, chartValue, dashboardValue }) => {
        if (!active) return;
        setCollections(value);
        setCharts(chartValue);
        setDashboards(dashboardValue);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Unable to load analytics.');
      })
      .finally(() => {
        if (active) setLoadedFor(selectedCollectionId ?? '');
      });
    return () => {
      active = false;
    };
  }, [selectedCollectionId]);
  return (
    <CollectionBrowserScreen
      collections={collections}
      charts={charts}
      dashboards={dashboards}
      selectedCollectionId={selectedCollectionId}
      recentIds={recentIds}
      loading={loading}
      error={error}
      onCreate={(name, parentId) =>
        runMutation(
          () => createCollection({ name, parentId }),
          (created) => setCollections((current) => [...current, created]),
        )
      }
      onRename={(id, name) =>
        runMutation(
          () => updateCollection(id, { name }),
          (updated) =>
            setCollections((current) => current.map((item) => (item.id === id ? updated : item))),
        )
      }
      onMove={(id, parentId) =>
        runMutation(
          () => moveCollection(id, parentId),
          (moved) =>
            setCollections((current) => current.map((item) => (item.id === id ? moved : item))),
        )
      }
      onArchive={(id) =>
        runMutation(
          () => archiveCollection(id),
          () =>
            setCollections((current) =>
              current.map((item) =>
                item.id === id ? { ...item, archivedAt: new Date().toISOString() } : item,
              ),
            ),
        )
      }
      onCreateDashboard={(name, description, collectionId) =>
        runMutation(
          () => createDashboard({ name, description, collectionId }),
          (created) => {
            setDashboards((current) => [
              ...current,
              {
                id: created.id,
                collectionId: created.collectionId,
                name: created.name,
                description: created.description,
                revision: created.revision,
                updatedAt: created.updatedAt,
              },
            ]);
            router.push(`/analytics/dashboards/${encodeURIComponent(created.id)}/edit`);
          },
        )
      }
    />
  );
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Unable to update analytics collections.';
}
