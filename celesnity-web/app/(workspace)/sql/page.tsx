import type { Metadata } from 'next';

import { QueryWorkbenchFeature } from '@/app/(workspace)/sql/_components/query-workbench-feature';
import { PageContainer } from '@/app/_components/layout/page-container';

export const metadata: Metadata = { title: 'Query' };

export default function SqlPage() {
  return (
    <PageContainer>
      <QueryWorkbenchFeature />
    </PageContainer>
  );
}
