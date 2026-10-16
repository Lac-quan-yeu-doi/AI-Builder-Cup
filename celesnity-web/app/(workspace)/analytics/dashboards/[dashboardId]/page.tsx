import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { DashboardFeature } from './_components/dashboard-feature';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage({
  params,
}: {
  readonly params: Promise<{ readonly dashboardId: string }>;
}) {
  const { dashboardId } = await params;
  return (
    <PageContainer width="wide">
      <DashboardFeature dashboardId={decodeURIComponent(dashboardId)} standalone />
    </PageContainer>
  );
}
