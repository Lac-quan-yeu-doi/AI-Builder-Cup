'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getInjection } from '@/di/container';
import { useAnalyticsRecentsStore } from '@/app/_stores/analytics-recents.store';
import type {
  CanonicalChart,
  ChartPreview,
  ChartRevision,
} from '@/src/entities/models/canonical-chart';
import { SavedChartScreen } from './saved-chart-screen';

const getChart = getInjection('GetCanonicalChartController');
const runSaved = getInjection('RunSavedCanonicalChartController');
const listRevisions = getInjection('ListCanonicalChartRevisionsController');
const restoreRevision = getInjection('RestoreCanonicalChartRevisionController');
const listCollections = getInjection('ListChartCollectionsController');
const renderer = getInjection('ChartRendererService');

export function SavedChartFeature({ chartId }: { readonly chartId: string }) {
  const [chart, setChart] = useState<CanonicalChart | null>(null);
  const [preview, setPreview] = useState<ChartPreview | null>(null);
  const [revisions, setRevisions] = useState<readonly ChartRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [restoringRevisionNumber, setRestoringRevisionNumber] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ from: number; to: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only for the breadcrumb: the page used to be reachable with no way back to
  // the collection it belongs to.
  const [collectionName, setCollectionName] = useState<string | null>(null);
  const active = useRef(true);

  const refresh = useCallback(
    async (id: string, parameterValues: Record<string, string | number | boolean | null> = {}) => {
      setRunning(true);
      setError(null);
      setPreview(null); // latest failed run must not fall back to older rows
      try {
        const result = await runSaved({ chartId: id, parameterValues });
        if (active.current) setPreview(result);
      } catch (reason: unknown) {
        if (active.current)
          setError(reason instanceof Error ? reason.message : 'The chart query failed.');
      } finally {
        if (active.current) setRunning(false);
      }
    },
    [],
  );

  // What the library leads with. Recording it on open rather than on save is
  // the point: the strongest ranking signal here is what you looked at.
  useEffect(() => {
    void useAnalyticsRecentsStore.persist
      .rehydrate()
      ?.then(() => useAnalyticsRecentsStore.getState().noteObject(chartId, 'CHART'));
  }, [chartId]);

  useEffect(() => {
    active.current = true;
    void (async () => {
      try {
        const loaded = await getChart(chartId);
        if (!active.current) return;
        setChart(loaded);
        const history = await listRevisions(chartId);
        if (active.current) setRevisions(history);
        void listCollections()
          .then((collections) => {
            if (!active.current) return;
            const owner = collections.find((item) => item.id === loaded.collectionId);
            setCollectionName(owner ? (owner.kind === 'PERSONAL' ? 'Personal' : owner.name) : null);
          })
          .catch(() => {
            // The breadcrumb degrades to a generic label; the chart still loads.
          });
        await refresh(chartId);
      } catch (reason: unknown) {
        if (active.current)
          setError(reason instanceof Error ? reason.message : 'Unable to load chart.');
      } finally {
        if (active.current) setLoading(false);
      }
    })();
    return () => {
      active.current = false;
    };
  }, [chartId, refresh]);

  const restore = useCallback(
    async (revisionNumber: number) => {
      if (!chart || restoringRevisionNumber !== null) return;
      setRestoringRevisionNumber(revisionNumber);
      setError(null);
      setNotice(null);
      try {
        const restored = await restoreRevision({
          chartId: chart.id,
          revisionNumber,
          expectedRevision: chart.currentRevisionNumber,
        });
        if (!active.current) return;
        setChart(restored);
        const history = await listRevisions(chart.id);
        if (!active.current) return;
        setRevisions(history);
        setNotice({ from: revisionNumber, to: restored.currentRevisionNumber });
        await refresh(chart.id);
      } catch (reason: unknown) {
        if (active.current) {
          setError(reason instanceof Error ? reason.message : 'Unable to restore chart version.');
        }
      } finally {
        if (active.current) setRestoringRevisionNumber(null);
      }
    },
    [chart, refresh, restoringRevisionNumber],
  );

  return (
    <SavedChartScreen
      chart={chart}
      preview={preview}
      revisions={revisions}
      loading={loading}
      running={running}
      restoringRevisionNumber={restoringRevisionNumber}
      notice={notice}
      error={error}
      onRefresh={() => void refresh(chartId)}
      onRestore={(revisionNumber) => void restore(revisionNumber)}
      renderer={renderer}
      collectionName={collectionName}
    />
  );
}
