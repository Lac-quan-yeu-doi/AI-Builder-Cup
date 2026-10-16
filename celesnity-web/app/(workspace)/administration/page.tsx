import type { Metadata } from 'next';
import { AdministrationFeature } from './_components/administration-feature';
import { PageContainer } from '@/app/_components/layout/page-container';

export const metadata: Metadata = { title: 'Administration' };
export default function AdministrationPage() {
  return (
    <PageContainer>
      <AdministrationFeature />
    </PageContainer>
  );
}
