'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

import { Button } from '@/app/_components/ui/button';
import { PageBar } from '@/app/_components/ui/page-bar';
import { EmptyState } from '@/app/_components/ui/empty-state';
import { InlineError } from '@/app/_components/ui/page-alert';
import { Spinner } from '@/app/_components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_components/ui/dialog';
import { Card } from '@/app/_components/ui/card';
import { Combobox } from '@/app/_components/ui/combobox';
import { SelectField, TextField } from '@/app/_components/ui/fields';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { MetadataCrawlerController } from '@/src/interface-adapters/controllers/metadata-crawler/metadata-crawler.controller';
import type { ListDatabaseServicesController } from '@/src/interface-adapters/controllers/database-services/list-database-services.controller';
import { sourceTabHref } from '@/app/_components/layout/source-tab-href';
import type {
  MetadataCrawler,
  MetadataCrawlerAssignableService,
  MetadataCrawlerRun,
} from '@/src/entities/models/metadata-crawler';
import { MetadataCrawlerStatusBadge } from '@/app/_components/metadata-crawler/metadata-crawler-status-badge';
import {
  formatMetadataCrawlerCounters,
  formatMetadataCrawlerSchedule,
  formatMetadataCrawlerSnapshot,
  formatMetadataCrawlerTime,
} from '@/app/_components/metadata-crawler/metadata-crawler-format';
import {
  metadataCrawlerDefaultTimezone,
  metadataCrawlerTimezoneOptions,
} from '@/app/_components/metadata-crawler/metadata-crawler-timezones';

const timezoneOptions = metadataCrawlerTimezoneOptions();

interface Props {
  readonly controller: MetadataCrawlerController;
  /**
   * Only for turning a crawler's source id into the database it is filed
   * under. A crawler carries its `databaseService`, but that summary has no
   * `databaseName`, and without one there is no route to the source's own
   * screen — which is now where a scan is actually worked on.
   */
  readonly listDatabaseServices: ListDatabaseServicesController;
}

/**
 * Every scan in the workspace, on one page.
 *
 * Since the four crawler actions moved onto each source's Metadata scan tab,
 * this is no longer the place you have to visit to do the work — it is the
 * place you visit to see all of it at once: which sources have no scan, and
 * whether two of them are scheduled on top of each other. Each row therefore
 * leads back to the source that owns the scan rather than to a detail screen
 * of its own.
 */
export function MetadataCrawlerScreen({ controller, listDatabaseServices }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<readonly MetadataCrawler[]>();
  const [databaseBySource, setDatabaseBySource] = useState<Readonly<Record<string, string>>>({});
  const [services, setServices] = useState<readonly MetadataCrawlerAssignableService[]>([]);
  const [selected, setSelected] = useState<MetadataCrawler>();
  const [runs, setRuns] = useState<readonly MetadataCrawlerRun[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editing, setEditing] = useState<MetadataCrawler>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const assignDialogOpen = assignOpen || editing !== undefined;

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [page, eligible, sources] = await Promise.all([
        controller.list(),
        controller.listAssignableDatabaseServices(),
        listDatabaseServices({ page: 1 }),
      ]);
      setItems(page.items);
      setServices(eligible);
      setDatabaseBySource(databaseIndex(sources.items));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('metadataCrawler.loadError'));
    }
  }, [controller, listDatabaseServices, t]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      controller.list(),
      controller.listAssignableDatabaseServices(),
      // A failure here costs a link, not the page: the rows still render,
      // pointing at the crawler's own detail screen.
      listDatabaseServices({ page: 1 }).catch(() => ({ items: [] })),
    ])
      .then(([page, eligible, sources]) => {
        if (!active) return;
        setItems(page.items);
        setServices(eligible);
        setDatabaseBySource(databaseIndex(sources.items));
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : t('metadataCrawler.loadError'));
      });
    return () => {
      active = false;
    };
  }, [controller, listDatabaseServices, t]);

  async function runNow(item: MetadataCrawler) {
    setBusy(true);
    setError(undefined);
    try {
      const run = await controller.runNow(item.id);
      setItems((current) =>
        current?.map((candidate) =>
          candidate.id === item.id ? { ...candidate, lastRun: run } : candidate,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: MetadataCrawler) {
    setBusy(true);
    setError(undefined);
    try {
      const updated = await controller.update(item.id, { enabled: !item.enabled });
      setItems((current) =>
        current?.map((candidate) => (candidate.id === item.id ? updated : candidate)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: MetadataCrawler) {
    if (!window.confirm(t('metadataCrawler.confirmRemove'))) return;
    setBusy(true);
    setError(undefined);
    try {
      await controller.archive(item.id);
      setItems((current) => current?.filter((candidate) => candidate.id !== item.id));
      if (selected?.id === item.id) setSelected(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function openDetails(item: MetadataCrawler) {
    setSelected(item);
    setRuns([]);
    try {
      setRuns(await controller.listRuns(item.id, { limit: 5 }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    }
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (editing) {
      setBusy(true);
      setError(undefined);
      try {
        const updated = await controller.update(editing.id, {
          name: String(form.get('name') ?? '').trim() || undefined,
          schedule: {
            cadence: 'DAILY',
            timeOfDay: String(form.get('timeOfDay') ?? '').trim(),
            timezone: String(form.get('timezone') ?? '').trim(),
          },
        });
        setItems((current) =>
          current?.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
        );
        setEditing(undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('state.error'));
      } finally {
        setBusy(false);
      }
      return;
    }
    const serviceId = String(form.get('databaseServiceId') ?? '');
    const service = services.find((candidate) => candidate.id === serviceId);
    if (!service) {
      setError(t('metadataCrawler.assignUnavailable'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const created = await controller.assign({
        databaseServiceId: service.id,
        name: String(form.get('name') ?? '').trim() || undefined,
        schedule: {
          cadence: 'DAILY',
          timeOfDay: String(form.get('timeOfDay') ?? '01:00').trim(),
          timezone: String(form.get('timezone') ?? metadataCrawlerDefaultTimezone()).trim(),
        },
      });
      setItems((current) => [created, ...(current ?? [])]);
      setServices((current) => current.filter((candidate) => candidate.id !== service.id));
      setAssignOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid gap-5 p-5">
      <PageBar
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} disabled={busy}>
              {t('metadataCrawler.retry')}
            </Button>
            <Button onClick={() => setAssignOpen(true)} disabled={busy}>
              {t('metadataCrawler.assign')}
            </Button>
          </>
        }
        description={t('page.metadataCrawler.description')}
        eyebrow={
          <>
            {t('nav.group.data')} · {t('nav.databases')}
          </>
        }
        title={t('page.metadataCrawler.title')}
      />
      {error && !assignDialogOpen && !selected ? <InlineError>{error}</InlineError> : null}
      <Card className="overflow-hidden p-0" asChild>
        <section aria-label={t('metadataCrawler.title')}>
          {!items ? (
            <div className="grid min-h-[300px] place-items-center">
              <Spinner className="size-7 text-primary" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title={t('metadataCrawler.empty')}
              action={
                <Button onClick={() => setAssignOpen(true)}>{t('metadataCrawler.assign')}</Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-border bg-muted text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    {[
                      t('metadataCrawler.service'),
                      t('metadataCrawler.connector'),
                      t('metadataCrawler.state'),
                      t('metadataCrawler.schedule'),
                      t('metadataCrawler.lastRun'),
                      t('metadataCrawler.relations'),
                      t('metadataCrawler.actions'),
                    ].map((heading) => (
                      <th className="px-4 py-3" key={heading}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr className="border-b border-border last:border-0" key={item.id}>
                      <td className="px-4 py-4">
                        <Link
                          className="text-left font-semibold text-foreground hover:text-primary"
                          href={scanHref(item, databaseBySource)}
                        >
                          {item.databaseService.name}
                          <span className="mt-1 block text-xs font-normal text-muted-foreground">
                            {item.name}
                          </span>
                        </Link>
                        <button
                          className="mt-2 text-xs text-muted-foreground underline hover:text-primary"
                          onClick={() => void openDetails(item)}
                        >
                          {t('metadataCrawler.viewRuns')}
                        </button>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs">
                        {item.databaseService.connectorType}
                      </td>
                      <td className="px-4 py-4">
                        <MetadataCrawlerStatusBadge status={item.state} t={t} />
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-xs">
                          {formatMetadataCrawlerSchedule(item.schedule, t)}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.schedule.timezone}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs">
                        {item.lastRun ? (
                          <>
                            <MetadataCrawlerStatusBadge status={item.lastRun.status} t={t} />
                            <span className="mt-1 block text-muted-foreground">
                              {formatMetadataCrawlerTime(
                                item.lastRun.finishedAt ?? item.lastRun.queuedAt,
                              )}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs">
                        {formatMetadataCrawlerSnapshot(item.snapshotSummary, t)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="xs"
                            onClick={() => void runNow(item)}
                            disabled={busy || item.state === 'ARCHIVED'}
                          >
                            {t('metadataCrawler.runNow')}
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => void toggle(item)}
                            disabled={busy || item.state === 'ARCHIVED'}
                          >
                            {item.enabled
                              ? t('metadataCrawler.pause')
                              : t('metadataCrawler.resume')}
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => setEditing(item)}
                            disabled={busy || item.state === 'ARCHIVED'}
                          >
                            {t('metadataCrawler.edit')}
                          </Button>
                          <Button
                            size="xs"
                            variant="destructive-ghost"
                            onClick={() => void remove(item)}
                            disabled={busy}
                          >
                            {t('metadataCrawler.remove')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Card>

      <Dialog
        open={assignDialogOpen}
        onOpenChange={(next) => {
          if (!next) {
            setAssignOpen(false);
            setEditing(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? t('metadataCrawler.edit') : t('metadataCrawler.assignTitle')}
            </DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => void assign(event)}>
            {editing ? (
              <p className="m-0 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                {editing.databaseService.name} · {editing.databaseService.connectorType}
              </p>
            ) : (
              <SelectField
                label={t('metadataCrawler.database')}
                name="databaseServiceId"
                required
                defaultValue=""
                data={[
                  { label: t('metadataCrawler.selectDatabase'), value: '', disabled: true },
                  ...services.map((service) => ({
                    label: `${service.name} (${service.connectorType})`,
                    value: service.id,
                  })),
                ]}
              />
            )}
            <TextField
              label={t('metadataCrawler.name')}
              name="name"
              defaultValue={editing?.name}
              placeholder={t('metadataCrawler.namePlaceholder')}
            />
            <TextField
              label={t('metadataCrawler.time')}
              name="timeOfDay"
              type="time"
              defaultValue={
                editing?.schedule.cadence === 'DAILY' ? editing.schedule.timeOfDay : '01:00'
              }
            />
            <Combobox
              label={t('metadataCrawler.timezone')}
              name="timezone"
              data={timezoneOptions}
              defaultValue={editing?.schedule.timezone ?? metadataCrawlerDefaultTimezone()}
              placeholder={t('metadataCrawler.timezonePlaceholder')}
            />
            {!editing && services.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">
                {t('metadataCrawler.assignUnavailable')}
              </p>
            ) : null}
            {error ? <InlineError>{error}</InlineError> : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setAssignOpen(false);
                  setEditing(undefined);
                }}
              >
                {t('metadataCrawler.cancel')}
              </Button>
              <Button type="submit" disabled={busy || (!editing && services.length === 0)}>
                {editing ? t('action.save') : t('metadataCrawler.saveAssignment')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selected !== undefined}
        onOpenChange={(next) => {
          if (!next) {
            setSelected(undefined);
          }
        }}
      >
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t('metadataCrawler.details')}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="grid gap-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="m-0 text-lg font-semibold">{selected.databaseService.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatMetadataCrawlerSchedule(selected.schedule, t)} ·{' '}
                    {selected.schedule.timezone}
                  </p>
                </div>
                <MetadataCrawlerStatusBadge status={selected.state} t={t} />
              </div>
              <section>
                <h3 className="mb-2 text-sm font-semibold">{t('metadataCrawler.runs')}</h3>
                {runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('metadataCrawler.noRuns')}</p>
                ) : (
                  <div className="grid gap-2">
                    {runs.map((run) => (
                      <div
                        className="flex items-center justify-between rounded-lg border border-border p-3"
                        key={run.id}
                      >
                        <div>
                          <MetadataCrawlerStatusBadge status={run.status} t={t} />
                          <span className="ml-2 text-xs text-muted-foreground">
                            {formatMetadataCrawlerTime(run.finishedAt ?? run.queuedAt)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatMetadataCrawlerCounters(run, t)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}

/** `databaseServiceId` -> the database it is filed under, skipping unfiled ones. */
function databaseIndex(
  services: readonly { readonly id: string; readonly databaseName?: string }[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    services.flatMap((service) =>
      service.databaseName === undefined ? [] : [[service.id, service.databaseName]],
    ),
  );
}

/**
 * Where a row leads.
 *
 * The source's own Metadata scan tab whenever the source is filed under a
 * database, and the standalone crawler screen otherwise — a source created
 * before `databaseName` survived the request body has no database to route
 * through, and a dead link is worse than an older screen.
 */
function scanHref(
  crawler: MetadataCrawler,
  databaseBySource: Readonly<Record<string, string>>,
): string {
  const database = databaseBySource[crawler.databaseServiceId];
  return database === undefined
    ? `/metadata-crawler/${encodeURIComponent(crawler.id)}`
    : sourceTabHref(database, crawler.databaseServiceId, 'scan');
}
