import type { Metadata } from 'next';
import { PlantOverviewFeature } from '../_components/plant-overview-feature';

export const metadata: Metadata = { title: 'Plant overview' };

export default async function PlantOverviewPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>;
}) {
  const { siteId } = await params;
  return <PlantOverviewFeature siteId={decodeURIComponent(siteId)} />;
}
