import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { ChartBuilderFeature } from '@/app/(workspace)/charts/_components/chart-builder-feature';

export const metadata: Metadata = { title: 'New chart' };

interface PageProps {
  readonly searchParams: Promise<{
    readonly collectionId?: string;
    readonly entry?: string;
  }>;
}

export default async function NewChartPage({ searchParams }: PageProps) {
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
