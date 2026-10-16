import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { CollectionBrowserFeature } from './_components/collection-browser-feature';

export const metadata: Metadata = { title: 'Our analytics' };

export default function AnalyticsPage() {
  return (
    <PageContainer width="wide">
      <CollectionBrowserFeature />
    </PageContainer>
  );
}
