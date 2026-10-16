import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageContainer } from '@/app/_components/layout/page-container';
import { GuideScreen } from './_components/guide-screen';

export const metadata: Metadata = { title: 'Documents' };

// The screen reads the open chapter from the query string, and this route is
// otherwise static, so Next needs a boundary to prerender the shell around it.
export default function DocumentsPage() {
  return (
    <PageContainer>
      <Suspense fallback={null}>
        <GuideScreen />
      </Suspense>
    </PageContainer>
  );
}
