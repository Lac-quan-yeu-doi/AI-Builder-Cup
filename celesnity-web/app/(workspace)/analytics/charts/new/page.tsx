import type { Metadata } from 'next';
import { PageContainer } from '@/app/_components/layout/page-container';
import { ChartBuilderFeature } from '@/app/_components/shared/chart-builder-feature';

export const metadata: Metadata = { title: 'New chart' };

export default async function NewAnalyticsChartPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly collectionId?: string;
    readonly entry?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <PageContainer width="full">
      <ChartBuilderFeature
        initialCollectionId={params.collectionId}
        initialEntryMode={entryMode(params.entry)}
      />
    </PageContainer>
  );
}

function entryMode(value?: string): 'QUESTION' | 'NATIVE' | undefined {
  if (value === 'question') return 'QUESTION';
  if (value === 'sql') return 'NATIVE';
  return undefined;
}
