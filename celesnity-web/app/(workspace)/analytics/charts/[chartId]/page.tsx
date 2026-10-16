import type { Metadata } from 'next';
import { PageContainer } from '@/app/_components/layout/page-container';
import { SavedChartFeature } from './_components/saved-chart-feature';

export const metadata: Metadata = { title: 'Chart' };

export default async function SavedChartPage({
  params,
}: {
  readonly params: Promise<{ readonly chartId: string }>;
}) {
  const { chartId } = await params;
  return (
    <PageContainer width="wide">
      <SavedChartFeature chartId={decodeURIComponent(chartId)} />
    </PageContainer>
  );
}
