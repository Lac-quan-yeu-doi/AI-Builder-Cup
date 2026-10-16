'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { MetadataCrawlerController } from '@/src/interface-adapters/controllers/metadata-crawler/metadata-crawler.controller';
import type { SourceMetadataController } from '@/src/interface-adapters/controllers/metadata-crawler/source-metadata.controller';
import type { GetDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/get-database-service.controller';
import type { TestSavedDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/test-saved-database-service.controller';
import type { CdcConnectionProfileController } from '@/src/interface-adapters/controllers/database-services/cdc-connection-profile.controller';
import type { DatabaseServiceViewModel } from '@/src/interface-adapters/presenters/database-service.presenter';
import type { MetadataCrawler, MetadataCrawlerRun } from '@/src/entities/models/metadata-crawler';
import { errorMessage } from '@/app/_components/shared/error-message';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { useUrlTab } from '@/app/_components/layout/use-url-tab';
import { SOURCE_DEFAULT_TAB, SOURCE_TABS } from '@/app/_components/layout/source-tab-href';
import { PageBar } from '@/app/_components/ui/page-bar';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { ScanScheduleDialog } from '@/app/_components/metadata-crawler/scan-schedule-dialog';
import { SourceScanCard } from '@/app/_components/metadata-crawler/source-scan-card';
import { SourceMetadataExplorerScreen } from '@/app/_components/metadata-crawler/source-metadata-explorer-screen';
import { MetadataCrawlerStatusBadge } from '@/app/_components/metadata-crawler/metadata-crawler-status-badge';
import { formatMetadataCrawlerTime } from '@/app/_components/metadata-crawler/metadata-crawler-format';
import { VerificationResult } from '@/app/_components/database-service/verification-result';
import { CdcConnectionCard } from '@/app/_components/database-service/cdc-connection-card';
import { useTranslation } from '@/app/_i18n/use-translation';
import { databaseTabHref } from '../../../_components/database-screen';

export interface SourceScreenControllers {
  readonly getDatabaseService: GetDatabaseServiceController;
  readonly testDatabaseService: TestSavedDatabaseServiceController;
  readonly cdcConnection: CdcConnectionProfileController;
  readonly metadataCrawler: MetadataCrawlerController;
  readonly sourceMetadata: SourceMetadataController;
}

interface SourceScreenProps {
  readonly controllers: SourceScreenControllers;
  readonly databaseName: string;
  readonly sourceId: string;
}

const RUN_HISTORY_LIMIT = 10;

/**
 * One source, with the three questions asked of it in order: where it points,
 * when it was last scanned, and what that scan found.
 *
 * Scripts are deliberately absent. A script is written against a source
 * connection, but it is code with its own workbench, not a property of the
 * connection, and putting it here would make this screen two things.
 */
/**
 * The Sources tab with this source's editor already open.
 *
 * Built through `URLSearchParams` rather than by appending `&edit=`: the tab
 * helper omits `?tab=` for the default tab, and a hand-joined query would then
 * produce `/databases/x&edit=y`.
 */
function editSourceHref(database: string, sourceId: string): string {
  const base = databaseTabHref(database, 'sources');
  const [path, query] = base.split('?');
  const params = new URLSearchParams(query ?? '');
  params.set('edit', sourceId);
  return `${path}?${params.toString()}`;
}

export function SourceScreen({ controllers, databaseName, sourceId }: SourceScreenProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCrawlerAssignment = searchParams.get('assignCrawler') === 'true';
  const openedCrawlerAssignmentFromUrl = useRef(false);
  // In the URL so the source list can open a source straight on the tab the
  // visitor asked for — "see what the scan found" lands on the tables, not on
  // the connection form they then have to click past.
  const [activeTab, goToTab] = useUrlTab(SOURCE_TABS, SOURCE_DEFAULT_TAB);
  const [service, setService] = useState<DatabaseServiceViewModel>();
  const [crawler, setCrawler] = useState<MetadataCrawler>();
  const [runs, setRuns] = useState<readonly MetadataCrawlerRun[]>([]);
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // The dialog assigns when this is unset and edits when it holds the scan, so
  // opening it for an edit has to say which — `crawler` alone cannot, since it
  // is also set while assigning a second time after a removal.
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const setCrawlerAssignmentRouteOpen = useCallback(
    (open: boolean) => {
      const next = new URLSearchParams(searchParams.toString());
      if (open) next.set('assignCrawler', 'true');
      else next.delete('assignCrawler');
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!requestedCrawlerAssignment) {
      openedCrawlerAssignmentFromUrl.current = false;
      return;
    }
    if (openedCrawlerAssignmentFromUrl.current || scheduleOpen) return;
    openedCrawlerAssignmentFromUrl.current = true;
    setEditingSchedule(false);
    setScheduleOpen(true);
  }, [requestedCrawlerAssignment, scheduleOpen]);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      setFailure(undefined);
      const loaded = await controllers.getDatabaseService(sourceId);
      // The scan is optional: a source can be connected before one is assigned,
      // which is exactly the state the assign action exists for.
      const page = await controllers.metadataCrawler
        .list()
        .catch(() => ({ items: [] as readonly MetadataCrawler[], total: 0 }));
      const assigned = page.items.find((entry) => entry.databaseServiceId === sourceId);
      const history =
        assigned === undefined
          ? []
          : await controllers.metadataCrawler
              .listRuns(assigned.id, { limit: RUN_HISTORY_LIMIT })
              .catch(() => [] as readonly MetadataCrawlerRun[]);

      if (!cancelled) {
        setService(loaded);
        setCrawler(assigned);
        setRuns(history);
      }
    };

    load().catch((error: unknown) => {
      if (!cancelled) {
        setFailure(errorMessage(error, t('source.loadError')));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [controllers, reloadToken, sourceId, t]);

  const runScan = async (): Promise<void> => {
    if (crawler === undefined || busy) {
      return;
    }
    setBusy(true);
    try {
      await controllers.metadataCrawler.runNow(crawler.id);
      setReloadToken((token) => token + 1);
    } catch (error) {
      setFailure(errorMessage(error, t('source.scanError')));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Pause or resume the schedule.
   *
   * `enabled` is the field Core takes; `state` is what it reports back, and the
   * two are not the same flag — a paused scan reads `PAUSED`, but a blocked one
   * reads `BLOCKED` while still being enabled.
   */
  const toggleScan = async (): Promise<void> => {
    if (crawler === undefined || busy) {
      return;
    }
    setBusy(true);
    try {
      await controllers.metadataCrawler.update(crawler.id, { enabled: !crawler.enabled });
      setReloadToken((token) => token + 1);
    } catch (error) {
      setFailure(errorMessage(error, t('source.scan.toggleError')));
    } finally {
      setBusy(false);
    }
  };

  const removeScan = async (): Promise<void> => {
    if (crawler === undefined || busy) {
      return;
    }
    setBusy(true);
    try {
      await controllers.metadataCrawler.archive(crawler.id);
      setReloadToken((token) => token + 1);
    } catch (error) {
      setFailure(errorMessage(error, t('source.scan.removeError')));
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async (): Promise<void> => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await controllers.testDatabaseService(sourceId);
      setReloadToken((token) => token + 1);
    } catch (error) {
      setFailure(errorMessage(error, t('source.testError')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-5">
      <PageBar
        actions={
          <>
            {/* The detail screen could look at a source but never change it,
             * so a wrong host meant going back to the list to fix it. The
             * editor lives with the list; this opens it there. */}
            <Button asChild variant="outline">
              <Link href={editSourceHref(databaseName, sourceId)}>{t('source.action.edit')}</Link>
            </Button>
            {/* Scan now used to sit here beside them, and appeared only once a
             * scan existed — a header whose buttons come and go with another
             * object's lifecycle. It acts on the scan, so it lives on the scan
             * card in the Metadata scan tab. */}
            <Button
              data-tutorial-target="test-saved-database-source"
              disabled={busy}
              onClick={() => void testConnection()}
              variant="outline"
            >
              {t('source.action.test')}
            </Button>
          </>
        }
        // The database used to be a `Badge` here, indistinguishable from the
        // connector chip beside it, so the only way back out of a source was
        // the browser's own button.
        backTo={{
          href: databaseTabHref(databaseName, 'sources'),
          label: databaseName,
        }}
        meta={service ? <Badge variant="outline">{service.connectorType}</Badge> : null}
        title={service?.name ?? t('source.loading')}
      />

      {failure ? <PageAlert>{failure}</PageAlert> : null}

      {!service && !failure ? (
        <Skeleton className="h-[220px] rounded-xl" role="status" aria-label={t('state.loading')} />
      ) : null}

      {service ? (
        <Tabs onValueChange={goToTab} value={activeTab}>
          <TabsList>
            <TabsTrigger value="connection">{t('source.tab.connection')}</TabsTrigger>
            <TabsTrigger data-tutorial-target="source-scan-tab" value="scan">
              {t('source.tab.scan')}
            </TabsTrigger>
            <TabsTrigger data-tutorial-target="source-tables-tab" value="tables">
              {t('source.tab.tables')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connection">
            <div className="grid max-w-[720px] gap-4">
              <Card className="gap-4 p-5">
                {/* Six short identifiers used to be six stacked label/value pairs
                 * spread across the full page width, each taking a row of its
                 * own. They are settings, not prose: one line each, label left,
                 * value right, hairline between. */}
                <dl className="m-0 grid text-body-sm">
                  {service.summary
                    // An empty object or a blank string says nothing; the row it
                    // occupies costs more than the fact it carries.
                    .filter((item) => item.value.trim() !== '' && item.value.trim() !== '{}')
                    .map((item) => (
                      <div
                        className="flex items-baseline justify-between gap-6 border-b border-border py-2 last:border-0"
                        key={item.key}
                      >
                        <dt className="shrink-0 text-caption text-muted-foreground">
                          {item.label}
                        </dt>
                        <dd className="m-0 truncate text-right font-mono text-caption">
                          {item.value}
                        </dd>
                      </div>
                    ))}
                </dl>
                {/* `untested` has no outcome to show, and the view model only
                 * carries a timestamp once a test has actually run. */}
                {service.verification.status !== 'untested' && service.verification.testedAt ? (
                  <div>
                    <VerificationResult
                      result={{
                        status: service.verification.status,
                        testedAt: service.verification.testedAt,
                        ...(service.verification.message
                          ? { message: service.verification.message }
                          : {}),
                      }}
                    />
                  </div>
                ) : null}
              </Card>
              <CdcConnectionCard
                connectorType={service.connectorType}
                controller={controllers.cdcConnection}
                databaseServiceId={sourceId}
              />
            </div>
          </TabsContent>

          <TabsContent value="scan">
            {crawler === undefined ? (
              <EmptyBlock
                title={t('source.scan.none')}
                description={t('source.scan.assignHint')}
                action={
                  // Assigning used to mean leaving for the crawler list, picking
                  // this same source out of a dropdown, and finding the way back.
                  // The source is already known here; two fields are what is
                  // actually being asked for.
                  <Button
                    data-tutorial-target="assign-metadata-crawler"
                    onClick={() => {
                      setEditingSchedule(false);
                      setScheduleOpen(true);
                      openedCrawlerAssignmentFromUrl.current = true;
                      setCrawlerAssignmentRouteOpen(true);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    {t('source.scan.assign')}
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-4">
                <SourceScanCard
                  busy={busy}
                  crawler={crawler}
                  onEditSchedule={() => {
                    setEditingSchedule(true);
                    setScheduleOpen(true);
                  }}
                  onRemove={() => void removeScan()}
                  onRunNow={() => void runScan()}
                  onToggle={() => void toggleScan()}
                />

                <Card className="p-5">
                  <h3 className="m-0 mb-3 text-caption font-[750] tracking-[0.06em] text-muted-foreground uppercase">
                    {t('source.scan.history')}
                  </h3>
                  {runs.length === 0 ? (
                    <p className="m-0 text-caption text-muted-foreground">
                      {t('source.scan.noRuns')}
                    </p>
                  ) : (
                    <ul className="m-0 grid list-none gap-2 p-0">
                      {runs.map((run) => (
                        <li
                          className="flex flex-wrap items-center gap-2.5 border-b border-border pb-2 text-caption last:border-0 last:pb-0"
                          key={run.id}
                        >
                          <MetadataCrawlerStatusBadge status={run.status} t={t} />
                          <span className="text-muted-foreground">
                            {formatMetadataCrawlerTime(run.finishedAt ?? run.queuedAt)}
                          </span>
                          <span className="text-muted-foreground">
                            {t('source.scan.relations', { count: run.counters.relationCount })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="tables">
            {crawler === undefined ? (
              <EmptyBlock
                title={t('source.tables.none')}
                description={t('source.tables.noneHint')}
              />
            ) : (
              <SourceMetadataExplorerScreen
                crawlerController={controllers.metadataCrawler}
                crawlerId={crawler.id}
                embedded
                sourceController={controllers.sourceMetadata}
              />
            )}
          </TabsContent>
        </Tabs>
      ) : null}

      <ScanScheduleDialog
        controller={controllers.metadataCrawler}
        {...(editingSchedule && crawler ? { crawler } : {})}
        databaseServiceId={sourceId}
        onOpenChange={(open) => {
          setScheduleOpen(open);
          if (!open && !editingSchedule) setCrawlerAssignmentRouteOpen(false);
        }}
        onSaved={() => setReloadToken((token) => token + 1)}
        open={scheduleOpen}
      />
    </section>
  );
}
