import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { CollectionBrowserFeature } from '../../_components/collection-browser-feature';

export const metadata: Metadata = { title: 'Analytics collection' };

export default async function AnalyticsCollectionPage({
  params,
}: {
  readonly params: Promise<{ collectionId: string }>;
}) {
  const { collectionId } = await params;
  return (
    <PageContainer width="wide">
      <CollectionBrowserFeature selectedCollectionId={collectionId} />
    </PageContainer>
  );
}
