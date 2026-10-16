import type { Metadata } from 'next';
import { PageContainer } from '@/app/_components/layout/page-container';
import { EditChartFeature } from './edit-chart-feature';

export const metadata: Metadata = { title: 'Edit chart' };

export default async function EditChartPage({
  params,
}: {
  readonly params: Promise<{ readonly chartId: string }>;
}) {
  const { chartId } = await params;
  return (
    <PageContainer width="full">
      <EditChartFeature chartId={decodeURIComponent(chartId)} />
    </PageContainer>
  );
}
