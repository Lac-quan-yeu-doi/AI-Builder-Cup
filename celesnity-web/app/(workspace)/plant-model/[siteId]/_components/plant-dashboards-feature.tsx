'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LayoutDashboardIcon, PlusIcon, StarIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { PageBar } from '@/app/_components/ui/page-bar';
import { useTranslation } from '@/app/_i18n/use-translation';
import { NativeSelect, NativeSelectOption } from '@/app/_components/ui/native-select';
import { getInjection } from '@/di/container';
import { usePlantWorkspace } from './plant-workspace-context';
import type { ChartCollection } from '@/src/entities/models/chart-collection';
import type { DashboardSummary } from '@/src/entities/models/dashboard';
import type {
  PlantDashboardAssociation,
  PlantDashboardRole,
} from '@/src/entities/models/plant-model';

const plantModel = getInjection('PlantModelController');
const listCollections = getInjection('ListChartCollectionsController');
const listDashboards = getInjection('ListDashboardsController');
const createDashboard = getInjection('CreateDashboardController');

const roles: readonly PlantDashboardRole[] = [
  'overview',
  'operations',
  'quality',
  'maintenance',
  'custom',
];

export function PlantDashboardsFeature({ siteId }: { readonly siteId: string }) {
  const { t } = useTranslation();
  const workspace = usePlantWorkspace();
  const [collections, setCollections] = useState<readonly ChartCollection[]>([]);
  const [dashboards, setDashboards] = useState<readonly DashboardSummary[]>([]);
  const [associations, setAssociations] = useState<readonly PlantDashboardAssociation[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([plantModel.listDashboards(siteId), listCollections()])
      .then(async ([associationValues, collectionValues]) => ({
        associationValues,
        collectionValues,
        dashboardValues: (
          await Promise.all(
            collectionValues
              .filter((collection) => collection.archivedAt === null)
              .map((collection) => listDashboards(collection.id).catch(() => [])),
          )
        ).flat(),
      }))
      .then(({ associationValues, collectionValues, dashboardValues }) => {
        if (!active) return;
        setAssociations(associationValues);
        setCollections(collectionValues);
        setDashboards(uniqueDashboards(dashboardValues));
        setCandidateId(
          uniqueDashboards(dashboardValues).find(
            (dashboard) => !associationValues.some((item) => item.dashboardId === dashboard.id),
          )?.id ?? '',
        );
      })
      .catch((reason: unknown) => {
        if (active) setError(messageOf(reason));
      });
    return () => {
      active = false;
    };
  }, [siteId]);

  const details = useMemo(
    () =>
      associations
        .map((association) => ({
          association,
          dashboard: dashboards.find((dashboard) => dashboard.id === association.dashboardId),
        }))
        .sort((left, right) => left.association.displayOrder - right.association.displayOrder),
    [associations, dashboards],
  );
  const available = dashboards.filter(
    (dashboard) => !associations.some((item) => item.dashboardId === dashboard.id),
  );
  const writableCollection = collections.find(
    (collection) => collection.archivedAt === null && collection.access === 'CURATE',
  );

  async function associate(dashboardId: string): Promise<void> {
    if (!dashboardId) return;
    try {
      setAssociations(
        await plantModel.associateDashboard(siteId, dashboardId, {
          role: associations.length === 0 ? 'overview' : 'custom',
          displayOrder: associations.length,
          isDefault: associations.length === 0,
        }),
      );
      setCandidateId('');
      setError('');
    } catch (reason: unknown) {
      setError(messageOf(reason));
    }
  }

  async function update(
    association: PlantDashboardAssociation,
    change: Partial<Pick<PlantDashboardAssociation, 'role' | 'isDefault'>>,
  ): Promise<void> {
    try {
      setAssociations(
        await plantModel.associateDashboard(siteId, association.dashboardId, {
          role: change.role ?? association.role,
          displayOrder: association.displayOrder,
          isDefault: change.isDefault ?? association.isDefault,
        }),
      );
      setError('');
    } catch (reason: unknown) {
      setError(messageOf(reason));
    }
  }

  async function createAndAssociate(): Promise<void> {
    if (!writableCollection) {
      setError('Create or obtain curate access to an Analytics collection first.');
      return;
    }
    try {
      const created = await createDashboard({
        name: 'Plant operations',
        description: 'Operational dashboard associated with this plant model.',
        collectionId: writableCollection.id,
      });
      setDashboards((current) => [
        ...current,
        {
          id: created.id,
          collectionId: created.collectionId,
          name: created.name,
          description: created.description,
          revision: created.revision,
          updatedAt: created.updatedAt,
        },
      ]);
      await associate(created.id);
    } catch (reason: unknown) {
      setError(messageOf(reason));
    }
  }

  async function remove(association: PlantDashboardAssociation): Promise<void> {
    try {
      await plantModel.removeDashboard(siteId, association.dashboardId);
      const remaining = associations.filter((item) => item.dashboardId !== association.dashboardId);
      if (association.isDefault && remaining[0]) {
        setAssociations(
          await plantModel.associateDashboard(siteId, remaining[0].dashboardId, {
            role: remaining[0].role,
            displayOrder: remaining[0].displayOrder,
            isDefault: true,
          }),
        );
      } else {
        setAssociations(remaining);
      }
      setError('');
    } catch (reason: unknown) {
      setError(messageOf(reason));
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-4 min-[900px]:p-8" aria-label="Plant dashboards">
      <div className="mb-6">
        <PageBar
          eyebrow={
            <>
              {t('plantRail.group.plant')} · {workspace.site?.name ?? ''}
            </>
          }
          title="Plant dashboards"
          description="Associate multiple reusable Analytics dashboards with this plant."
          actions={
            <Button type="button" onClick={() => void createAndAssociate()}>
              <PlusIcon aria-hidden="true" /> New dashboard
            </Button>
          }
        />
      </div>
      {error ? (
        <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {available.length > 0 ? (
        <section
          className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4"
          aria-label="Associate existing dashboard"
        >
          <label className="grid min-w-72 gap-1 text-sm">
            Existing Analytics dashboard
            <NativeSelect
              value={candidateId}
              onChange={(event) => setCandidateId(event.target.value)}
            >
              <NativeSelectOption value="">Choose dashboard…</NativeSelectOption>
              {available.map((dashboard) => (
                <NativeSelectOption key={dashboard.id} value={dashboard.id}>
                  {dashboard.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={!candidateId}
            onClick={() => void associate(candidateId)}
          >
            Associate
          </Button>
        </section>
      ) : null}

      {details.length === 0 ? (
        <div className="grid min-h-72 place-items-center rounded-lg border border-dashed text-center">
          <div>
            <LayoutDashboardIcon
              className="mx-auto mb-3 size-9 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="font-semibold">No associated dashboards</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create one here or associate an existing Analytics dashboard.
            </p>
          </div>
        </div>
      ) : (
        <section className="grid gap-3 md:grid-cols-2" aria-label="Associated dashboards">
          {details.map(({ association, dashboard }) => (
            <article key={association.dashboardId} className="rounded-lg border bg-card p-4">
              <div className="flex items-start gap-3">
                <LayoutDashboardIcon
                  className="mt-1 size-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    className="font-semibold hover:underline"
                    href={`/plant-model/${encodeURIComponent(siteId)}/dashboards/${encodeURIComponent(association.dashboardId)}`}
                  >
                    {dashboard?.name ?? 'Unavailable dashboard'}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {dashboard?.description ?? 'The dashboard may no longer be accessible.'}
                  </p>
                </div>
                {association.isDefault ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-primary">
                    <StarIcon className="size-3" aria-hidden="true" /> Default
                  </span>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <NativeSelect
                  aria-label={`Role for ${dashboard?.name ?? association.dashboardId}`}
                  value={association.role}
                  onChange={(event) =>
                    void update(association, { role: event.target.value as PlantDashboardRole })
                  }
                >
                  {roles.map((role) => (
                    <NativeSelectOption key={role} value={role}>
                      {role[0]?.toUpperCase()}
                      {role.slice(1)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {!association.isDefault ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void update(association, { isDefault: true })}
                  >
                    Make default
                  </Button>
                ) : null}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${dashboard?.name ?? 'dashboard'}`}
                  onClick={() => void remove(association)}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link
                    href={`/analytics/dashboards/${encodeURIComponent(association.dashboardId)}/edit`}
                  >
                    Edit layout
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function uniqueDashboards(values: readonly DashboardSummary[]): readonly DashboardSummary[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}
function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Unable to update plant dashboards.';
}
