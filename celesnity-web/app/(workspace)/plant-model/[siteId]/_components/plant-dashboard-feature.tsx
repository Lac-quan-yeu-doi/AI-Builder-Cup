'use client';

import { useEffect, useState } from 'react';

import { DashboardFeature } from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/dashboard-feature';
import { getInjection } from '@/di/container';
import { usePlantWorkspace } from './plant-workspace-context';

const plantModel = getInjection('PlantModelController');

export function PlantDashboardFeature({
  siteId,
  dashboardId,
}: {
  readonly siteId: string;
  readonly dashboardId: string;
}) {
  const [allowed, setAllowed] = useState<boolean>();
  const { selectDashboard } = usePlantWorkspace();

  useEffect(() => {
    let active = true;
    void plantModel.listDashboards(siteId).then(
      (associations) => {
        if (active) setAllowed(associations.some((item) => item.dashboardId === dashboardId));
      },
      () => {
        if (active) setAllowed(false);
      },
    );
    selectDashboard(dashboardId);
    return () => {
      active = false;
      selectDashboard(undefined);
    };
  }, [dashboardId, selectDashboard, siteId]);

  if (allowed === undefined)
    return <p className="p-8 text-sm text-muted-foreground">Loading plant dashboard…</p>;
  if (!allowed)
    return (
      <p role="alert" className="p-8 text-sm text-destructive">
        This dashboard is not associated with the plant.
      </p>
    );
  return <DashboardFeature dashboardId={dashboardId} />;
}
