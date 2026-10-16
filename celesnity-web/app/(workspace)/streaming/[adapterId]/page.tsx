import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';

import { AdapterFeature } from './_components/adapter-feature';

export const metadata: Metadata = { title: 'Stream adapter' };

export default async function AdapterPage({
  params,
}: {
  readonly params: Promise<{ readonly adapterId: string }>;
}) {
  const { adapterId } = await params;
  return (
    <PageContainer>
      <AdapterFeature adapterId={decodeURIComponent(adapterId)} />
    </PageContainer>
  );
}
