import type { Metadata } from 'next';

import { DocumentFeature } from '@/app/(workspace)/documents/_components/document-feature';
import { PageContainer } from '@/app/_components/layout/page-container';

export const metadata: Metadata = { title: 'Documents' };

export default function DocumentsPage() {
  return (
    <PageContainer>
      <DocumentFeature />
    </PageContainer>
  );
}
