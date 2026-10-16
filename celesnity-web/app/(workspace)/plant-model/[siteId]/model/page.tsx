import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { PlantModelFeature } from '../_components/plant-model-feature';

export const metadata: Metadata = { title: 'Plant model editor' };

export default async function PlantModelEditorPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>;
}) {
  const { siteId } = await params;
  return (
    <PageContainer width="full">
      <PlantModelFeature siteId={decodeURIComponent(siteId)} />
    </PageContainer>
  );
}
