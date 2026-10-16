import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { SourceFeature } from './_components/source-feature';

export const metadata: Metadata = { title: 'Source' };

interface PageProps {
  readonly params: Promise<{ readonly database: string; readonly sourceId: string }>;
}

export default async function SourcePage({ params }: PageProps) {
  const { database, sourceId } = await params;
  return (
    <PageContainer>
      <SourceFeature databaseName={decodeURIComponent(database)} sourceId={sourceId} />
    </PageContainer>
  );
}
