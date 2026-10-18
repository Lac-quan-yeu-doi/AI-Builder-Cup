'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/app/_components/ui/utils';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { PageAlert, InlineError } from '@/app/_components/ui/page-alert';
import { PageBar } from '@/app/_components/ui/page-bar';
import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { MetadataCrawlerController } from '@/src/interface-adapters/controllers/metadata-crawler/metadata-crawler.controller';
import type { SourceMetadataController } from '@/src/interface-adapters/controllers/metadata-crawler/source-metadata.controller';
import type {
  SourceColumnSort,
  SourceMetadataPage,
  SourceMetadataPageQuery,
  SourceMetadataSnapshotSummary,
  SourceNamespace,
  SourceNamespaceSort,
  SourceRelation,
  SourceRelationSort,
} from '@/src/entities/models/source-metadata';
import type { MetadataCrawler } from '@/src/entities/models/metadata-crawler';
import type { GetDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/get-database-service.controller';
import { formatMetadataCrawlerTime } from './metadata-crawler-format';
import {
  SourceMetadataListPanel,
  type SourceMetadataListColumn,
} from './source-metadata-list-panel';
import { SourceRelationDetail } from './source-relation-detail';

interface Props {
  readonly crawlerId: string;
  /** Rendered inside a source screen, which already supplies the heading. */
  readonly embedded?: boolean;
  readonly crawlerController: MetadataCrawlerController;
  readonly sourceController: SourceMetadataController;
  /**
   * Standalone only. The crawler names its source but not the database that
   * source is filed under, and the way back belongs to the source's own screen
   * rather than to the crawler list this page used to return to.
   */
  readonly getDatabaseService?: GetDatabaseServiceController;
}

const namespaceDefaults: SourceMetadataPageQuery<SourceNamespaceSort> = {
  page: 1,
  pageSize: 50,
  sortBy: 'name',
  sortDirection: 'asc',
};
const relationDefaults: SourceMetadataPageQuery<SourceRelationSort> = {
  page: 1,
  pageSize: 50,
  sortBy: 'name',
  sortDirection: 'asc',
};
const columnDefaults: SourceMetadataPageQuery<SourceColumnSort> = {
  page: 1,
  pageSize: 50,
  sortBy: 'ordinalPosition',
  sortDirection: 'asc',
};

export function SourceMetadataExplorerScreen({
  crawlerId,
  embedded = false,
  crawlerController,
  sourceController,
  getDatabaseService,
}: Props) {
  const { t } = useTranslation();
  const [crawler, setCrawler] = useState<MetadataCrawler>();
  const [summary, setSummary] = useState<SourceMetadataSnapshotSummary>();
  const [namespaces, setNamespaces] = useState<SourceMetadataPage<SourceNamespace>>();
  const [relations, setRelations] = useState<SourceMetadataPage<SourceRelation>>();
  const [relation, setRelation] = useState<SourceRelation>();
  const [columns, setColumns] =
    useState<SourceMetadataPage<import('@/src/entities/models/source-metadata').SourceColumn>>();
  const [constraints, setConstraints] =
    useState<readonly import('@/src/entities/models/source-metadata').SourceConstraint[]>();
  const [selectedNamespaceId, setSelectedNamespaceId] = useState<string>();
  const [selectedRelationId, setSelectedRelationId] = useState<string>();
  const [namespaceQuery, setNamespaceQuery] = useState(namespaceDefaults);
  const [relationQuery, setRelationQuery] = useState(relationDefaults);
  const [columnQuery, setColumnQuery] = useState(columnDefaults);
  const [error, setError] = useState<string>();
  const [databaseName, setDatabaseName] = useState<string>();
  const [rescanning, setRescanning] = useState(false);
  const crawlerGeneration = useRef(0);
  const namespaceGeneration = useRef(0);
  const relationGeneration = useRef(0);
  const detailGeneration = useRef(0);

  useEffect(() => {
    const generation = ++crawlerGeneration.current;
    void Promise.all([crawlerController.get(crawlerId), sourceController.getSummary(crawlerId)])
      .then(([loadedCrawler, loadedSummary]) => {
        if (generation !== crawlerGeneration.current) return;
        setCrawler(loadedCrawler);
        setSummary(loadedSummary);
      })
      .catch((cause: unknown) => {
        if (generation === crawlerGeneration.current) {
          setError(cause instanceof Error ? cause.message : t('metadataExplorer.loadError'));
        }
      });
  }, [crawlerController, crawlerId, sourceController, t]);

  useEffect(() => {
    const serviceId = crawler?.databaseServiceId;
    if (getDatabaseService === undefined || serviceId === undefined) return;
    let cancelled = false;
    // Tolerated, not awaited: losing the breadcrumb is not a reason to withhold
    // the snapshot this screen exists to show.
    void getDatabaseService(serviceId)
      .then((service) => {
        if (!cancelled) setDatabaseName(service.databaseName);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [crawler?.databaseServiceId, getDatabaseService]);

  const rescan = async (): Promise<void> => {
    setRescanning(true);
    try {
      await crawlerController.runNow(crawlerId);
      const [refreshed, summary_] = await Promise.all([
        crawlerController.get(crawlerId),
        sourceController.getSummary(crawlerId),
      ]);
      setCrawler(refreshed);
      setSummary(summary_);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('metadataExplorer.loadError'));
    } finally {
      setRescanning(false);
    }
  };

  useEffect(() => {
    const generation = ++namespaceGeneration.current;
    void sourceController
      .listNamespaces(crawlerId, namespaceQuery)
      .then((page) => {
        if (generation !== namespaceGeneration.current) return;
        setNamespaces(page);
        // Open the first schema rather than park a "Select a namespace" panel
        // half the screen wide. Set functionally so a later search, which
        // re-runs this effect, cannot clobber a choice already made.
        const first = page.items[0];
        if (first !== undefined) setSelectedNamespaceId((current) => current ?? first.id);
      })
      .catch((cause: unknown) => {
        if (generation === namespaceGeneration.current) {
          setError(cause instanceof Error ? cause.message : t('metadataExplorer.loadError'));
        }
      });
  }, [crawlerId, namespaceQuery, sourceController, t]);

  useEffect(() => {
    if (!selectedNamespaceId) {
      return;
    }
    const generation = ++relationGeneration.current;
    void sourceController
      .listRelations(crawlerId, selectedNamespaceId, relationQuery)
      .then((page) => {
        if (generation === relationGeneration.current) setRelations(page);
      })
      .catch((cause: unknown) => {
        if (generation === relationGeneration.current) {
          setError(cause instanceof Error ? cause.message : t('metadataExplorer.loadError'));
        }
      });
  }, [crawlerId, relationQuery, selectedNamespaceId, sourceController, t]);

  useEffect(() => {
    if (!selectedRelationId) {
      return;
    }
    const generation = ++detailGeneration.current;
    void Promise.all([
      sourceController.getRelation(crawlerId, selectedRelationId),
      sourceController.listColumns(crawlerId, selectedRelationId, columnQuery),
      sourceController.listConstraints(crawlerId, selectedRelationId),
    ])
      .then(([loadedRelation, loadedColumns, loadedConstraints]) => {
        if (generation !== detailGeneration.current) return;
        setRelation(loadedRelation);
        setColumns(loadedColumns);
        setConstraints(loadedConstraints);
      })
      .catch((cause: unknown) => {
        if (generation === detailGeneration.current) {
          setError(cause instanceof Error ? cause.message : t('metadataExplorer.loadError'));
        }
      });
  }, [columnQuery, crawlerId, selectedRelationId, sourceController, t]);

  const snapshot = summary ?? crawler?.snapshotSummary;
  const crawledAt = namespaces?.items[0]
    ? formatMetadataCrawlerTime(namespaces.items[0].lastCrawledAt)
    : undefined;
  const selectedNamespaceName = namespaces?.items.find(
    (item) => item.id === selectedNamespaceId,
  )?.name;
  const namespaceColumns: readonly SourceMetadataListColumn<SourceNamespace>[] = [
    {
      key: 'name',
      header: t('metadataExplorer.name'),
      render: (item) => (
        <button
          className={cn(
            'w-full text-left font-semibold hover:text-primary',
            selectedNamespaceId === item.id ? 'text-primary' : 'text-foreground',
          )}
          aria-pressed={selectedNamespaceId === item.id}
          onClick={() => {
            // Re-picking the open one would clear the panel beside it without
            // changing the id the loading effect keys on, so nothing would
            // fetch it back.
            if (selectedNamespaceId === item.id) return;
            setSelectedNamespaceId(item.id);
            setSelectedRelationId(undefined);
            setRelations(undefined);
            setRelation(undefined);
            setColumns(undefined);
            setConstraints(undefined);
            setRelationQuery(relationDefaults);
          }}
        >
          {item.name}
        </button>
      ),
    },
    { key: 'type', header: t('metadataExplorer.relationType'), render: (item) => item.type },
    {
      key: 'relations',
      header: t('metadataExplorer.relationCount'),
      render: (item) => item.relationCount,
    },
  ];
  const relationColumns: readonly SourceMetadataListColumn<SourceRelation>[] = [
    {
      key: 'name',
      header: t('metadataExplorer.name'),
      render: (item) => (
        <button
          className={cn(
            'w-full text-left font-semibold hover:text-primary',
            selectedRelationId === item.id ? 'text-primary' : 'text-foreground',
          )}
          aria-pressed={selectedRelationId === item.id}
          onClick={() => {
            if (selectedRelationId === item.id) return;
            setSelectedRelationId(item.id);
            setRelation(undefined);
            setColumns(undefined);
            setConstraints(undefined);
            setColumnQuery(columnDefaults);
          }}
        >
          {item.name}
        </button>
      ),
    },
    {
      key: 'type',
      header: t('metadataExplorer.relationType'),
      render: (item) => item.relationType,
    },
    {
      key: 'columns',
      header: t('metadataExplorer.columnCount'),
      render: (item) => item.columnCount,
    },
  ];

  function setNamespaceSort(value: string) {
    if (value !== 'name' && value !== 'relationCount' && value !== 'lastCrawledAt') return;
    setNamespaceQuery((current) => ({ ...current, page: 1, sortBy: value as SourceNamespaceSort }));
  }
  function setNamespaceDirection(value: 'asc' | 'desc') {
    setNamespaceQuery((current) => ({ ...current, page: 1, sortDirection: value }));
  }
  function setRelationSort(value: string) {
    if (
      value !== 'name' &&
      value !== 'relationType' &&
      value !== 'columnCount' &&
      value !== 'lastCrawledAt'
    )
      return;
    setRelationQuery((current) => ({ ...current, page: 1, sortBy: value as SourceRelationSort }));
  }
  function setRelationDirection(value: 'asc' | 'desc') {
    setRelationQuery((current) => ({ ...current, page: 1, sortDirection: value }));
  }
  function setColumnSort(value: string) {
    if (
      value !== 'ordinalPosition' &&
      value !== 'name' &&
      value !== 'nativeType' &&
      value !== 'nullable'
    )
      return;
    setColumnQuery((current) => ({ ...current, page: 1, sortBy: value as SourceColumnSort }));
  }

  return (
    <main className={cn('grid gap-5', embedded ? 'p-0' : 'p-5')}>
      {/* Embedded in a source's own screen, which already names the source and
       * offers the way back; repeating both gives the tab two headings. */}
      {/* The last screen still carrying the marketing hero PageBar replaced
       * everywhere else: a serif clamp(2.2rem,5vw,4rem) headline, an uppercase
       * eyebrow and a back link, roughly 250px spent restating the name of the
       * page the visitor had just clicked into. */}
      {/* Embedded, the source screen names the page; the rescan action still
       * has to survive, the way every other embedded screen keeps its own
       * primary action. Dropping the whole bar dropped that too. */}
      {embedded ? (
        <div className="flex justify-end">
          <Button disabled={rescanning} onClick={() => void rescan()} variant="outline">
            {t('metadataExplorer.rescan')}
          </Button>
        </div>
      ) : (
        <PageBar
          actions={
            <Button disabled={rescanning} onClick={() => void rescan()} variant="outline">
              {t('metadataExplorer.rescan')}
            </Button>
          }
          // Same exit as every other detail screen: the source this snapshot
          // belongs to, named, above the title.
          backTo={
            databaseName !== undefined && crawler !== undefined
              ? {
                  href: `/databases/${encodeURIComponent(databaseName)}/sources/${encodeURIComponent(crawler.databaseServiceId)}`,
                  label: crawler.databaseService.name,
                }
              : { href: '/metadata-crawler', label: t('metadataExplorer.back') }
          }
          description={t('metadataExplorer.subtitle')}
          eyebrow={
            <>
              {t('nav.group.data')} · {t('nav.databases')}
            </>
          }
          meta={
            crawler ? (
              <>
                <Badge variant="outline">{crawler.databaseService.connectorType}</Badge>
                {databaseName ? <Badge variant="secondary">{databaseName}</Badge> : null}
                {crawledAt ? (
                  <span className="text-caption text-muted-foreground">
                    {t('metadataExplorer.lastCrawledAt')} · {crawledAt}
                  </span>
                ) : null}
              </>
            ) : null
          }
          title={crawler?.databaseService.name ?? t('metadataExplorer.title')}
        />
      )}
      {error ? <InlineError>{error}</InlineError> : null}
      {snapshot?.hasSnapshot && crawler?.lastRun?.status === 'FAILED' ? (
        <PageAlert role="status" title={t('metadataExplorer.failedWarning')} tone="warning">
          {/* The warning used to state the problem and stop. Re-running the
           * scan is the only thing that resolves it. */}
          <Button
            className="mt-2"
            disabled={rescanning}
            onClick={() => void rescan()}
            size="sm"
            variant="outline"
          >
            {t('metadataExplorer.rescan')}
          </Button>
        </PageAlert>
      ) : null}
      {snapshot && !snapshot.hasSnapshot ? (
        <EmptyBlock title={t('metadataExplorer.noSnapshot')} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <SourceMetadataListPanel
            count={namespaces?.pagination.total}
            isRowSelected={(item) => item.id === selectedNamespaceId}
            title={t('metadataExplorer.namespaces')}
            search={namespaceQuery.search ?? ''}
            onSearchChange={(search) =>
              setNamespaceQuery((current) => ({ ...current, page: 1, search: search || undefined }))
            }
            sortBy={namespaceQuery.sortBy}
            sortOptions={[
              { value: 'name', label: t('metadataExplorer.name') },
              { value: 'relationCount', label: t('metadataExplorer.relationCount') },
            ]}
            onSortChange={setNamespaceSort}
            sortDirection={namespaceQuery.sortDirection}
            onDirectionChange={setNamespaceDirection}
            rows={namespaces?.items}
            columns={namespaceColumns}
            rowKey={(item) => item.id}
            emptyMessage={t('metadataExplorer.emptyNamespaces')}
            page={namespaces?.pagination.page ?? 1}
            totalPages={namespaces?.pagination.totalPages ?? 0}
            onPageChange={(page) => setNamespaceQuery((current) => ({ ...current, page }))}
          />
          {!selectedNamespaceId ? (
            <EmptyBlock title={t('metadataExplorer.selectNamespace')} />
          ) : (
            <SourceMetadataListPanel
              // Named so the two panels read as one drill rather than as two
              // unrelated lists that happen to sit side by side.
              context={selectedNamespaceName}
              count={relations?.pagination.total}
              isRowSelected={(item) => item.id === selectedRelationId}
              title={t('metadataExplorer.relations')}
              search={relationQuery.search ?? ''}
              onSearchChange={(search) =>
                setRelationQuery((current) => ({
                  ...current,
                  page: 1,
                  search: search || undefined,
                }))
              }
              sortBy={relationQuery.sortBy}
              sortOptions={[
                { value: 'name', label: t('metadataExplorer.name') },
                { value: 'relationType', label: t('metadataExplorer.relationType') },
                { value: 'columnCount', label: t('metadataExplorer.columnCount') },
              ]}
              onSortChange={setRelationSort}
              sortDirection={relationQuery.sortDirection}
              onDirectionChange={setRelationDirection}
              rows={relations?.items}
              columns={relationColumns}
              rowKey={(item) => item.id}
              emptyMessage={t('metadataExplorer.emptyRelations')}
              page={relations?.pagination.page ?? 1}
              totalPages={relations?.pagination.totalPages ?? 0}
              onPageChange={(page) => setRelationQuery((current) => ({ ...current, page }))}
            />
          )}
        </div>
      )}
      {selectedRelationId ? (
        <SourceRelationDetail
          namespaceName={selectedNamespaceName}
          relation={relation}
          columns={columns?.items}
          constraints={constraints}
          columnSearch={columnQuery.search ?? ''}
          columnSortBy={columnQuery.sortBy}
          columnSortDirection={columnQuery.sortDirection}
          columnPage={columns?.pagination.page ?? 1}
          columnTotalPages={columns?.pagination.totalPages ?? 0}
          onColumnSearchChange={(search) =>
            setColumnQuery((current) => ({ ...current, page: 1, search: search || undefined }))
          }
          onColumnSortChange={setColumnSort}
          onColumnDirectionChange={(sortDirection) =>
            setColumnQuery((current) => ({ ...current, page: 1, sortDirection }))
          }
          onColumnPageChange={(page) => setColumnQuery((current) => ({ ...current, page }))}
        />
      ) : null}
    </main>
  );
}
