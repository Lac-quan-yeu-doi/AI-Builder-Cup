import type { Metadata } from 'next';

import { DashboardEditorFeature } from '../_components/dashboard-editor-feature';

export const metadata: Metadata = { title: 'Edit dashboard' };

export default async function EditDashboardPage({
  params,
}: {
  readonly params: Promise<{ readonly dashboardId: string }>;
}) {
  const { dashboardId } = await params;
  return <DashboardEditorFeature dashboardId={decodeURIComponent(dashboardId)} />;
}
