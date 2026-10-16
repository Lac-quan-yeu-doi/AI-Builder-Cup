import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { SourceMetadataFeature } from './_components/source-metadata-feature';

export const metadata: Metadata = { title: 'Source metadata | Metadata Crawler' };

interface PageProps {
  readonly params: Promise<{ readonly crawlerId: string }>;
}

export default async function SourceMetadataPage({ params }: PageProps) {
  const { crawlerId } = await params;
  return (
    <PageContainer width="full">
      <SourceMetadataFeature crawlerId={crawlerId} />
    </PageContainer>
  );
}
