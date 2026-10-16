import { DatabaseServiceFeature } from '@/app/_components/database-service/database-service-feature';
import { PageContainer } from '@/app/_components/layout/page-container';

/** Workspace-wide registry of external systems, separate from the Iceberg catalog. */
export default function ConnectionsPage() {
  return (
    <PageContainer>
      <DatabaseServiceFeature />
    </PageContainer>
  );
}
