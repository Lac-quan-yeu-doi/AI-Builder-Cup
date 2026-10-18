'use client';

import { useCallback, useEffect, useState } from 'react';
import { SparklesIcon, Table2Icon } from 'lucide-react';

import type { ListCatalogsController } from '@/src/interface-adapters/controllers/catalog/list-catalogs.controller';
import type { ListTablesController } from '@/src/interface-adapters/controllers/catalog/list-tables.controller';
import type { LoadTableMetadataController } from '@/src/interface-adapters/controllers/catalog/load-table-metadata.controller';
import type { ListTableSnapshotsController } from '@/src/interface-adapters/controllers/catalog/list-table-snapshots.controller';
import type { PreviewTableController } from '@/src/interface-adapters/controllers/catalog/preview-table.controller';
import type {
  TableMetadataViewModel,
  TablePreviewViewModel,
  TableSnapshotViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';
import type { TableRef } from '@/src/entities/models/catalog';
import type { AsyncState } from '@/app/_components/catalog/catalog-view-state';
import { TableDetail } from '@/app/_components/catalog/table-detail';
import { DatabaseServiceFeature } from '@/app/_components/database-service/database-service-feature';
import { PipelineListFeature } from '@/app/_components/pipeline/pipeline-list-feature';
import { ExecutionMonitoringFeature } from '@/app/_components/execution/execution-monitoring-feature';
import type { ListDatabaseServicesController } from '@/src/interface-adapters/controllers/database-services/list-database-services.controller';
import type { ListPipelinesController } from '@/src/interface-adapters/controllers/pipelines/list-pipelines.controller';
import type { ListExecutionsController } from '@/src/interface-adapters/controllers/executions/list-executions.controller';
import type { DatabaseServiceViewModel } from '@/src/interface-adapters/presenters/database-service.presenter';
import type { ExecutionSummaryViewModel } from '@/src/interface-adapters/presenters/execution.presenter';
import type { TableSummaryViewModel } from '@/src/interface-adapters/presenters/catalog.presenter';
import type { PipelineSummaryViewModel } from '@/src/interface-adapters/presenters/pipeline.presenter';
import { errorMessage } from '@/app/_components/shared/error-message';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import { EmptyBlock, EmptyState } from '@/app/_components/ui/empty-state';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { hrefForTab, useUrlTab } from '@/app/_components/layout/use-url-tab';
import { PageBar } from '@/app/_components/ui/page-bar';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { cn } from '@/app/_components/ui/utils';
import { Tabs, TabsContent } from '@/app/_components/ui/tabs';
import { useTranslation } from '@/app/_i18n/use-translation';

import { useAssistantDock } from '@/app/_components/assistant/use-assistant-dock';

import { DatabaseAssistantPanel } from './database-assistant-panel';
import { DatabaseOverview } from './database-overview';
import { nextFlowStage } from './database-flow-stage';
import { DatabaseSubtabs } from './database-subtabs';
import { DatabaseNextStep } from './database-next-step';

export interface DatabaseScreenControllers {
  readonly listCatalogs: ListCatalogsController;
  readonly listTables: ListTablesController;
  readonly listPipelines: ListPipelinesController;
  readonly listDatabaseServices: ListDatabaseServicesController;
  readonly listExecutions: ListExecutionsController;
  readonly loadTableMetadata: LoadTableMetadataController;
  readonly listTableSnapshots: ListTableSnapshotsController;
  readonly previewTable: PreviewTableController;
}

interface DatabaseScreenProps {
  readonly controllers: DatabaseScreenControllers;
  readonly database: string;
}

interface DatabaseContents {
  readonly tables: readonly TableSummaryViewModel[];
  readonly pipelines: readonly PipelineSummaryViewModel[];
  /** Core ran out of pages before the walk did, so this list is partial. */
  readonly pipelinesTruncated: boolean;
  /**
   * The rows, not just the count. The overview reports how many are verified,
   * and a count cannot answer that. The Sources tab still mounts its own list.
   */
  readonly sources: readonly DatabaseServiceViewModel[];
  readonly executions: readonly ExecutionSummaryViewModel[];
}

// The ceiling `listPipelinesQuerySchema` accepts per request. Core has no
// filter on target database, so membership is decided here — which means one
// page was never enough: past a hundred pipelines a workspace-wide, this
// database's own pipelines and runs simply stopped being listed, with nothing
// on screen to say so.
const PIPELINE_SCAN_LIMIT = 100;
// Ten requests of a hundred. A cap rather than an open loop, because the list
// is paged by Core and a workspace that large deserves a server-side filter
// rather than a client walking it every time the screen mounts.
const PIPELINE_SCAN_MAX_PAGES = 10;

/**
 * Every pipeline Core will hand over, up to the cap.
 *
 * `truncated` is the honest half: a screen that silently drops rows is worse
 * than one that says it stopped.
 */
async function scanPipelines(
  listPipelines: ListPipelinesController,
): Promise<{ items: readonly PipelineSummaryViewModel[]; truncated: boolean }> {
  const collected: PipelineSummaryViewModel[] = [];

  for (let page = 1; page <= PIPELINE_SCAN_MAX_PAGES; page++) {
    const result = await listPipelines({ page, pageSize: PIPELINE_SCAN_LIMIT });
    collected.push(...result.items);
    if (page >= result.totalPages || result.items.length === 0) {
      return { items: collected, truncated: false };
    }
  }

  return { items: collected, truncated: true };
}

/**
 * Loads one detail panel and reports its own failure rather than the screen's.
 * Each panel is independent — snapshots can be unavailable while the columns
 * are fine — so a shared error state would hide two thirds of what loaded.
 */
function toRef(table: TableSummaryViewModel): TableRef {
  return { catalog: table.catalog, schema: table.schema, table: table.name };
}

async function loadPanel<T>(
  load: () => Promise<T>,
  apply: (state: AsyncState<T>) => void,
  fallback: string,
): Promise<void> {
  try {
    apply({ status: 'loaded', data: await load() });
  } catch (error) {
    apply({ status: 'error', message: errorMessage(error, fallback) });
  }
}

/**
 * One database, with everything that fills it.
 *
 * Tables come first because seeing what is in a database is the reason to open
 * it; the pipelines that wrote them and the sources those read from are the
 * "how did this get here / how do I add more" path behind it.
 */
export const DATABASE_TABS = ['overview', 'tables', 'sources', 'pipelines', 'runs'] as const;
export const DATABASE_DEFAULT_TAB = 'overview';

/**
 * A link into one of a database's tabs.
 *
 * Typed against `DATABASE_TABS`, so a tab that is renamed or removed breaks the
 * build rather than landing the visitor on the default. Both call sites here
 * spent three weeks pointing at `?tab=sources` after that stage was taken out.
 */
export function databaseTabHref(database: string, tab: (typeof DATABASE_TABS)[number]): string {
  return hrefForTab(
    `/databases/${encodeURIComponent(database)}`,
    tab,
    DATABASE_TABS,
    DATABASE_DEFAULT_TAB,
  );
}

export function DatabaseScreen({ controllers, database }: DatabaseScreenProps) {
  const { t } = useTranslation();
  // The open tab lives in the URL so a link can point at one.
  const [activeTab, goToTab] = useUrlTab(DATABASE_TABS, DATABASE_DEFAULT_TAB);
  const [contents, setContents] = useState<DatabaseContents>();
  const [failure, setFailure] = useState<string>();
  const [selectedTable, setSelectedTable] = useState<TableRef>();
  const [metadata, setMetadata] = useState<AsyncState<TableMetadataViewModel>>();
  const [snapshots, setSnapshots] = useState<AsyncState<readonly TableSnapshotViewModel[]>>();
  const [preview, setPreview] = useState<AsyncState<TablePreviewViewModel>>();

  const openTable = useCallback(
    (ref: TableRef): void => {
      setSelectedTable(ref);
      setMetadata({ status: 'loading' });
      setSnapshots({ status: 'loading' });
      setPreview({ status: 'loading' });
      void loadPanel(
        () => controllers.loadTableMetadata(ref),
        setMetadata,
        t('database.table.columnsError'),
      );
      void loadPanel(
        () => controllers.listTableSnapshots(ref),
        setSnapshots,
        t('database.table.snapshotsError'),
      );
      void loadPanel(
        () => controllers.previewTable(ref),
        setPreview,
        t('database.table.previewError'),
      );
    },
    [controllers, t],
  );

  const loadSnapshots = useCallback(
    (ref: TableRef) => controllers.listTableSnapshots(ref),
    [controllers],
  );

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      // Cleared here rather than in the effect body: switching database has to
      // drop the previous one's tables, and a reset outside the async function
      // is a render-phase side effect.
      setContents(undefined);
      setFailure(undefined);
      // The detail panel is keyed by table, and the previous database's table
      // is not in this one; leaving it up would show another database's rows
      // under this database's name.
      setSelectedTable(undefined);
      setMetadata(undefined);
      setSnapshots(undefined);
      setPreview(undefined);

      const catalogs = await controllers.listCatalogs();
      const catalog = catalogs[0];
      if (catalog === undefined) {
        throw new Error('The Core API did not report a Trino catalog.');
      }

      const [tables, pipelineScan, sourcePage, executions] = await Promise.all([
        controllers.listTables(catalog.name, database),
        scanPipelines(controllers.listPipelines),
        // `databaseName` is a real server filter, so this is one narrow request.
        controllers.listDatabaseServices({ databaseName: database, page: 1 }),
        // Runs are workspace-wide in Core; which of them belong here is decided
        // below, from the pipelines that write into this database.
        controllers.listExecutions().catch(() => [] as readonly ExecutionSummaryViewModel[]),
      ]);

      // Two ways to belong, and the rail has to count both or it contradicts
      // the tab beside it: `databaseName` is where the pipeline was filed when
      // it was created, `targetDatabase` is where its target node writes. A
      // draft has only the first, a pipeline built elsewhere only the second.
      const pipelines = pipelineScan.items.filter(
        (pipeline) => pipeline.databaseName === database || pipeline.targetDatabase === database,
      );
      if (!cancelled) {
        const mine = new Set(pipelines.map((pipeline) => pipeline.id));
        setContents({
          tables,
          pipelines,
          pipelinesTruncated: pipelineScan.truncated,
          sources: sourcePage.items,
          executions: executions.filter(
            (run) => run.pipelineId !== undefined && mine.has(run.pipelineId),
          ),
        });

        // Still opened ahead of time so the Tables tab never greets anyone with
        // an empty panel — but it is no longer the landing surface, so this is
        // preparation rather than the first thing anyone sees.
        const first = tables[0];
        if (first !== undefined) {
          openTable(toRef(first));
        }
      }
    };

    load().catch((error: unknown) => {
      if (!cancelled) {
        setFailure(errorMessage(error, t('database.loadError')));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [controllers, database, openTable, t]);

  const assistant = useAssistantDock('database', false);

  const counts = {
    sources: contents?.sources.length ?? 0,
    pipelines: contents?.pipelines.length ?? 0,
    tables: contents?.tables.length ?? 0,
  };
  const nextStage = contents ? nextFlowStage(counts) : undefined;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col min-[1080px]:flex-row">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <section className="mx-auto grid w-full max-w-[1400px] gap-5 px-6 py-8 min-[1081px]:px-10">
          <PageBar
            actions={
              <>
                {/* Docks the assistant beside the database rather than navigating
                 * to `/chat`: the question is about what is on this screen, and
                 * answering it should not cost the screen. */}
                <Button aria-pressed={assistant.open} onClick={assistant.toggle}>
                  <SparklesIcon size={17} />
                  {t('database.askAi')}
                </Button>
              </>
            }
            eyebrow={
              <>
                {t('nav.group.data')} · {t('nav.databases')}
              </>
            }
            meta={
              contents ? (
                <Badge variant="secondary">
                  {t('database.tableCount', { count: contents.tables.length })}
                </Badge>
              ) : null
            }
            title={database}
          />

          {failure ? <PageAlert>{failure}</PageAlert> : null}

          {!contents && !failure ? (
            <div className="grid gap-3" role="status" aria-label={t('state.loading')}>
              <Skeleton className="h-[92px] rounded-xl" />
              <Skeleton className="h-[92px] rounded-xl" />
            </div>
          ) : null}

          {contents ? (
            <Tabs className="min-w-0 gap-4" onValueChange={goToTab} value={activeTab}>
              <DatabaseSubtabs counts={{ ...counts, runs: contents.executions.length }} />

              <TabsContent className="pt-2" value="overview">
                {/* The one instruction, where it is the answer rather than a
                 * banner every other tab has to scroll past. */}
                {nextStage ? (
                  <div className="pb-6">
                    <DatabaseNextStep onGo={goToTab} stage={nextStage} />
                  </div>
                ) : null}
                <DatabaseOverview
                  executions={contents.executions}
                  loadSnapshots={loadSnapshots}
                  onGoToTab={goToTab}
                  onOpenTable={(ref) => {
                    openTable(ref);
                    goToTab('tables');
                  }}
                  pipelines={contents.pipelines}
                  sources={contents.sources}
                  tables={contents.tables}
                />
              </TabsContent>

              <TabsContent className="pt-2" value="tables">
                {contents.tables.length === 0 ? (
                  // No action here on purpose: the step card above already carries
                  // the only one that can succeed, and a second button offering a
                  // different verb would compete with it.
                  <EmptyBlock
                    title={t('database.empty.tables')}
                    description={t('database.empty.tablesHint')}
                  />
                ) : (
                  <div className="grid min-w-0 items-start gap-4 min-[961px]:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.7fr)]">
                    {/* Layout goes on the Card, not on the `ul`: `asChild` joins the
                     * two class lists verbatim rather than merging them, so a `gap`
                     * set on the child loses to the card's own. */}
                    <Card className="grid gap-0.5 p-1.5" asChild>
                      <ul className="m-0 list-none">
                        {contents.tables.map((table) => {
                          const current =
                            selectedTable?.schema === table.schema &&
                            selectedTable.table === table.name;
                          return (
                            <li key={`${table.schema}.${table.name}`}>
                              <button
                                aria-current={current ? 'true' : undefined}
                                className={cn(
                                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                                  current
                                    ? 'bg-accent text-foreground'
                                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                                )}
                                onClick={() => openTable(toRef(table))}
                                type="button"
                              >
                                {/* The glyph carries "table" so the name does not
                                 * have to; a column of bare identifiers reads as a
                                 * list of words rather than of things. */}
                                <Table2Icon
                                  aria-hidden="true"
                                  className={cn(
                                    'shrink-0',
                                    current ? 'text-primary' : 'text-muted-foreground/60',
                                  )}
                                  size={15}
                                />
                                <code
                                  className={cn('truncate text-body-sm', current && 'font-[650]')}
                                >
                                  {table.name}
                                </code>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </Card>

                    {selectedTable && metadata && snapshots && preview ? (
                      <Card className="gap-0 overflow-hidden py-0">
                        <TableDetail
                          metadata={metadata}
                          onRetryMetadata={() => openTable(selectedTable)}
                          onRetryPreview={() => openTable(selectedTable)}
                          onRetrySnapshots={() => openTable(selectedTable)}
                          preview={preview}
                          snapshots={snapshots}
                          table={selectedTable}
                        />
                      </Card>
                    ) : (
                      <Card className="gap-0 overflow-hidden py-0">
                        <EmptyState
                          mark={<Table2Icon size={20} />}
                          minHeight={260}
                          title={t('database.table.selectTitle')}
                          description={t('database.table.selectHint')}
                        />
                      </Card>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent className="pt-2" value="sources">
                {/* `databaseName` is a server filter Core already accepts, so this is
                 * the same screen `/connections` renders, asking a narrower question.
                 * It also pre-fills the create dialog, so a source connected here is
                 * filed under this database from the moment it exists. */}
                <DatabaseServiceFeature databaseName={database} embedded />
              </TabsContent>

              <TabsContent className="pt-2" value="pipelines">
                {contents.pipelinesTruncated ? (
                  <PageAlert role="status" title={t('database.pipelines.truncated')} tone="warning">
                    {t('database.pipelines.truncatedHint')}
                  </PageAlert>
                ) : null}
                <PipelineListFeature databaseName={database} embedded />
              </TabsContent>

              <TabsContent className="pt-2" value="runs">
                {/* Scoped to this database's pipelines: a run belongs to the
                 * database its pipeline writes into, not to the workspace. */}
                <ExecutionMonitoringFeature
                  embedded
                  pipelineIds={contents.pipelines.map((pipeline) => pipeline.id)}
                />
              </TabsContent>
            </Tabs>
          ) : null}
        </section>
      </div>

      {assistant.open ? (
        <DatabaseAssistantPanel
          database={database}
          onClose={assistant.hide}
          {...(selectedTable === undefined ? {} : { table: selectedTable })}
        />
      ) : null}
    </div>
  );
}
