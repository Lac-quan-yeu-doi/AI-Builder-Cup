import type { Metadata } from 'next';
import { PlantDashboardsFeature } from '../_components/plant-dashboards-feature';

export const metadata: Metadata = { title: 'Plant dashboards' };

export default async function PlantDashboardsPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>;
}) {
  const { siteId } = await params;
  return <PlantDashboardsFeature siteId={decodeURIComponent(siteId)} />;
}
