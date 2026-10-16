import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';

import { StreamingFeature } from './_components/streaming-feature';

export const metadata: Metadata = { title: 'MQTT streaming' };

export default function StreamingPage() {
  return (
    <PageContainer>
      <StreamingFeature />
    </PageContainer>
  );
}
