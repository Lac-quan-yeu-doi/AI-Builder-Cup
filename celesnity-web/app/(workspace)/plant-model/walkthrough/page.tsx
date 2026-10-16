import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { PlantWalkthroughFeature } from './_components/plant-walkthrough-feature';

export const metadata: Metadata = { title: 'Create a plant from a walkthrough' };

export default function PlantWalkthroughPage() {
  return (
    <PageContainer>
      <PlantWalkthroughFeature />
    </PageContainer>
  );
}
