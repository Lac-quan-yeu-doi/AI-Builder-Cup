'use client';

import { useRouter } from 'next/navigation';
import { getInjection } from '@/di/container';

import { ChartBuilderScreen } from './chart-builder-screen';

const controllers = Object.freeze({
  queryPreview: getInjection('PreviewCanonicalChartQueryController'),
  preview: getInjection('PreviewCanonicalChartController'),
  create: getInjection('CreateCanonicalChartController'),
  update: getInjection('UpdateCanonicalChartController'),
  saveAsNew: getInjection('SaveAsNewCanonicalChartController'),
  listCollections: getInjection('ListChartCollectionsController'),
  renderer: getInjection('ChartRendererService'),
  listCatalogs: getInjection('ListQueryCatalogsController'),
  listNamespaces: getInjection('ListQueryNamespacesController'),
  listTables: getInjection('ListTablesController'),
  loadTableMetadata: getInjection('LoadTableMetadataController'),
  compileQuery: getInjection('CompileCanonicalChartQueryController'),
});

export interface ChartBuilderFeatureProps {
  readonly initialCollectionId?: string;
  readonly initialEntryMode?: 'QUESTION' | 'NATIVE';
  readonly initialDraft?: import('@/src/entities/models/canonical-chart').ChartDraft;
  readonly chartId?: string;
  readonly expectedRevision?: number;
}

export function ChartBuilderFeature({
  initialCollectionId,
  initialEntryMode,
  initialDraft,
  chartId,
  expectedRevision,
}: ChartBuilderFeatureProps = {}) {
  const router = useRouter();
  return (
    <ChartBuilderScreen
      controllers={controllers}
      initialCollectionId={initialCollectionId}
      initialEntryMode={initialEntryMode}
      initialDraft={initialDraft}
      chartId={chartId}
      expectedRevision={expectedRevision}
      onSaved={(savedChartId) =>
        router.push(`/analytics/charts/${encodeURIComponent(savedChartId)}`)
      }
    />
  );
}
