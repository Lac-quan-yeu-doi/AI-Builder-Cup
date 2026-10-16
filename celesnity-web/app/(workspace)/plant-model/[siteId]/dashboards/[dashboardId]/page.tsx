import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/app/_components/ui/button';
import { PlantDashboardFeature } from '../../_components/plant-dashboard-feature';

export const metadata: Metadata = { title: 'Plant dashboard' };

export default async function PlantDashboardPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string; readonly dashboardId: string }>;
}) {
  const { siteId, dashboardId } = await params;
  const decodedDashboardId = decodeURIComponent(dashboardId);
  return (
    <main className="mx-auto max-w-[1600px] p-4 min-[900px]:p-6">
      <div className="mb-3 flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href={`/analytics/dashboards/${encodeURIComponent(decodedDashboardId)}/edit`}>
            Edit dashboard
          </Link>
        </Button>
      </div>
      <PlantDashboardFeature siteId={decodeURIComponent(siteId)} dashboardId={decodedDashboardId} />
    </main>
  );
}
