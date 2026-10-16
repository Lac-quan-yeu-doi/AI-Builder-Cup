import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { DatabaseFeature } from './_components/database-feature';

export const metadata: Metadata = { title: 'Database' };

interface PageProps {
  readonly params: Promise<{ readonly database: string }>;
}

export default async function DatabasePage({ params }: PageProps) {
  const { database } = await params;
  return (
    <PageContainer width="full">
      <DatabaseFeature database={decodeURIComponent(database)} />
    </PageContainer>
  );
}
