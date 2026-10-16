import { PageContainer } from '@/app/_components/layout/page-container';

import { PlantWorkspaceProvider } from './_components/plant-workspace-context';
import { PlantWorkspaceShell } from './_components/plant-workspace-shell';

export default async function PlantWorkspaceLayout({
  params,
  children,
}: {
  readonly params: Promise<{ readonly siteId: string }>;
  readonly children: React.ReactNode;
}) {
  const { siteId } = await params;
  const decoded = decodeURIComponent(siteId);
  return (
    <PlantWorkspaceProvider siteId={decoded}>
      {/* A definite height, not just a minimum: the shell splits it between a
       * header, a scrolling canvas and the assistant column, and any of the
       * three overflowing pushes the page instead of scrolling itself. */}
      <PageContainer width="full">
        <PlantWorkspaceShell siteId={decoded}>{children}</PlantWorkspaceShell>
      </PageContainer>
    </PlantWorkspaceProvider>
  );
}
