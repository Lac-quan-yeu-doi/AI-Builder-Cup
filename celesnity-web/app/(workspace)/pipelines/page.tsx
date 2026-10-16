import type { Metadata } from 'next';

import { PipelineListFeature } from '@/app/_components/pipeline/pipeline-list-feature';
import { PageContainer } from '@/app/_components/layout/page-container';

export const metadata: Metadata = { title: 'Pipeline Jobs' };

export default function PipelinesPage() {
  return (
    <PageContainer>
      <PipelineListFeature />
    </PageContainer>
  );
}
