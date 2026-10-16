'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LayoutDashboardIcon, RouteIcon, ShapesIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { getInjection } from '@/di/container';
import type { PlantDashboardAssociation } from '@/src/entities/models/plant-model';
import { DashboardFeature } from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/dashboard-feature';
import { PlantTopologyOverview } from './plant-topology-overview';
import { usePlantWorkspace } from './plant-workspace-context';

const plantModel = getInjection('PlantModelController');
const getDashboard = getInjection('GetDashboardController');

export function PlantOverviewFeature({ siteId }: { readonly siteId: string }) {
  const { site, selectDashboard } = usePlantWorkspace();
  const [associations, setAssociations] = useState<readonly PlantDashboardAssociation[]>([]);
  const [defaultName, setDefaultName] = useState('');
  const selected = associations.find((item) => item.isDefault) ?? associations[0];

  useEffect(() => {
    let active = true;
    void plantModel.listDashboards(siteId).then((value) => {
      if (active) setAssociations(value);
    });
    return () => {
      active = false;
    };
  }, [siteId]);

  useEffect(() => {
    selectDashboard(selected?.dashboardId);
    if (!selected) return;
    let active = true;
    void getDashboard(selected.dashboardId).then((dashboard) => {
      if (active) setDefaultName(dashboard.name);
    });
    return () => {
      active = false;
    };
  }, [selectDashboard, selected]);

  const metrics = useMemo(() => {
    const draft = site?.draft;
    return [
      { label: 'Modeled nodes', value: draft?.nodes.length ?? 0, icon: ShapesIcon },
      {
        label: 'Process routes',
        value: draft?.relationships.filter((item) => item.kind === 'routes-to').length ?? 0,
        icon: RouteIcon,
      },
      { label: 'Associated dashboards', value: associations.length, icon: LayoutDashboardIcon },
    ];
  }, [associations.length, site?.draft]);

  if (!site)
    return <main className="p-8 text-sm text-muted-foreground">Loading plant overview…</main>;

  return (
    <main className="mx-auto w-full max-w-[1600px] p-4 min-[900px]:p-6" aria-label="Plant overview">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold">Production overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Topology and dashboards for {site.name}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/plant-model/${encodeURIComponent(siteId)}/dashboards`}>
            Manage dashboards
          </Link>
        </Button>
      </div>

      <section className="mb-4 grid gap-3 sm:grid-cols-3" aria-label="Plant summary">
        {metrics.map(({ label, value, icon: Icon }) => (
          <article key={label} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </div>
            <strong className="mt-2 block text-2xl font-semibold tabular-nums">{value}</strong>
          </article>
        ))}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Production flow</h2>
            <p className="text-xs text-muted-foreground">
              Current model topology and configured status values
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/plant-model/${encodeURIComponent(siteId)}/model`}>Open model</Link>
          </Button>
        </div>
        <PlantTopologyOverview draft={site.draft} />
      </section>

      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{defaultName || 'Default dashboard'}</h2>
            <p className="text-xs text-muted-foreground">
              All charts in the plant&apos;s default dashboard
            </p>
          </div>
        </div>
        {selected ? (
          <DashboardFeature dashboardId={selected.dashboardId} />
        ) : (
          <div className="grid min-h-52 place-items-center rounded-lg border border-dashed text-center">
            <div>
              <p className="font-medium">No dashboard associated yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Associate an existing dashboard to show its charts here.
              </p>
              <Button asChild className="mt-4">
                <Link href={`/plant-model/${encodeURIComponent(siteId)}/dashboards`}>
                  Choose dashboard
                </Link>
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
