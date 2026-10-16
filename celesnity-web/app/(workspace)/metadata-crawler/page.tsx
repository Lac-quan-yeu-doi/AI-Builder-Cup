import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { MetadataCrawlerFeature } from './_components/metadata-crawler-feature';

export const metadata: Metadata = { title: 'Data Source Crawler' };

export default function MetadataCrawlerPage() {
  return (
    <PageContainer>
      <MetadataCrawlerFeature />
    </PageContainer>
  );
}
