import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { PlantSitesFeature } from './_components/plant-sites-feature';

export const metadata: Metadata = { title: 'Plant model' };

export default function PlantModelPage() {
  return (
    <PageContainer>
      <PlantSitesFeature />
    </PageContainer>
  );
}
