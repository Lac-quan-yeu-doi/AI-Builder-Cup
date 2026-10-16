import type { Metadata } from 'next';

import { CatalogExplorerFeature } from '@/app/(workspace)/catalog/_components/catalog-explorer-feature';
import { PageContainer } from '@/app/_components/layout/page-container';

export const metadata: Metadata = { title: 'Databases | Data Catalog' };

export default function CatalogDatabasesPage() {
  return (
    <PageContainer>
      <CatalogExplorerFeature view="databases" />
    </PageContainer>
  );
}
