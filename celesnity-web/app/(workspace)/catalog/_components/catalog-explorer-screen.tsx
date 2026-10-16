'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { TableRef } from '@/src/entities/models/catalog';
import type { CreateNamespaceController } from '@/src/interface-adapters/controllers/catalog/create-namespace.controller';
import type { ListCatalogsController } from '@/src/interface-adapters/controllers/catalog/list-catalogs.controller';
import type { ListNamespacesController } from '@/src/interface-adapters/controllers/catalog/list-namespaces.controller';
import type { ListTableSnapshotsController } from '@/src/interface-adapters/controllers/catalog/list-table-snapshots.controller';
import type { ListTablesController } from '@/src/interface-adapters/controllers/catalog/list-tables.controller';
import type { LoadTableMetadataController } from '@/src/interface-adapters/controllers/catalog/load-table-metadata.controller';
import type { MonitorTablePreviewController } from '@/src/interface-adapters/controllers/catalog/monitor-table-preview.controller';
import type { PreviewTableController } from '@/src/interface-adapters/controllers/catalog/preview-table.controller';
import type { UpdateNamespaceDescriptionController } from '@/src/interface-adapters/controllers/catalog/update-namespace-description.controller';
import type {
  CatalogViewModel,
  NamespaceViewModel,
  TableMetadataViewModel,
  TablePreviewViewModel,
  TableSnapshotViewModel,
  TableSummaryViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';
import type { AsyncState } from '@/app/_components/catalog/catalog-view-state';
import { CreateDatabaseModal } from '@/app/_components/catalog/create-database-modal';
import { BlockEmpty, BlockError, BlockLoading } from '@/app/_components/catalog/panel-state';
import { TableDetail } from '@/app/_components/catalog/table-detail';
import { errorMessage } from '@/app/_components/shared/error-message';
import { isCurrentRequestToken } from '@/app/_components/shared/request-token';
import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/app/_components/ui/fields';
import { InlineError } from '@/app/_components/ui/page-alert';
import { Spinner } from '@/app/_components/ui/spinner';
import { PageBar } from '@/app/_components/ui/page-bar';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';

export interface DeviceEventSelection {
  readonly table: TableRef;
  readonly deviceId: string;
  readonly deviceName: string;
}

interface CatalogExplorerScreenProps {
  readonly view?: 'databases' | 'tables';
  readonly initialDeviceEvent?: DeviceEventSelection;
  readonly controllers: Readonly<{
    listCatalogs: ListCatalogsController;
    createNamespace: CreateNamespaceController;
    updateNamespaceDescription: UpdateNamespaceDescriptionController;
    listNamespaces: ListNamespacesController;
    listTables: ListTablesController;
    loadMetadata: LoadTableMetadataController;
    listSnapshots: ListTableSnapshotsController;
    preview: PreviewTableController;
    monitorPreview: MonitorTablePreviewController;
  }>;
}

const headerCellClass =
  'border-b border-border bg-muted px-4 py-3 text-left text-micro font-[750] tracking-[0.05em] whitespace-nowrap text-foreground uppercase';
const bodyCellClass = 'border-b border-border px-4 py-3 text-body-sm text-foreground';

export function CatalogExplorerScreen({
  controllers,
  view = 'databases',
  initialDeviceEvent,
}: CatalogExplorerScreenProps) {
  const { t } = useTranslation();
  const [catalogs, setCatalogs] = useState<AsyncState<readonly CatalogViewModel[]>>({
    status: 'loading',
  });
  const [catalogReload, setCatalogReload] = useState(0);
  const [databases, setDatabases] = useState<AsyncState<readonly NamespaceViewModel[]>>();
  const [databaseReload, setDatabaseReload] = useState(0);
  const [selectedDatabase, setSelectedDatabase] = useState(initialDeviceEvent?.table.schema ?? '');
  const [tables, setTables] = useState<AsyncState<readonly TableSummaryViewModel[]>>();
  const [tableReload, setTableReload] = useState(0);
  const [databaseFilter, setDatabaseFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [selected, setSelected] = useState<TableRef>();
  const [deviceEvent, setDeviceEvent] = useState(initialDeviceEvent);
  const [metadata, setMetadata] = useState<AsyncState<TableMetadataViewModel>>();
  const [snapshots, setSnapshots] = useState<AsyncState<readonly TableSnapshotViewModel[]>>();
  const [preview, setPreview] = useState<AsyncState<TablePreviewViewModel>>();
  const [createOpen, setCreateOpen] = useState(false);
  const [databaseName, setDatabaseName] = useState('');
  const [databaseDescription, setDatabaseDescription] = useState('');
  const [createError, setCreateError] = useState<string>();
  const [createdMessage, setCreatedMessage] = useState<string>();
  const [createdDatabaseName, setCreatedDatabaseName] = useState<string>();
  const [isCreating, setIsCreating] = useState(false);
  const [editingDatabase, setEditingDatabase] = useState<NamespaceViewModel>();
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState<string>();
  const [isEditing, setIsEditing] = useState(false);
  const selectionToken = useRef(0);
  const previewMonitor = useRef<ReturnType<MonitorTablePreviewController> | undefined>(undefined);
  const initialDeviceEventApplied = useRef(false);
  const createTrigger = useRef<HTMLElement | null>(null);

  const managedCatalogs = catalogs.status === 'loaded' ? catalogs.data : [];
  const defaultCatalog =
    managedCatalogs.find((catalog) => catalog.name === 'iceberg') ?? managedCatalogs[0];
  const defaultCatalogName = defaultCatalog?.name;

  useEffect(() => {
    let cancelled = false;
    controllers.listCatalogs().then(
      (data) => {
        if (!cancelled) setCatalogs({ status: 'loaded', data });
      },
      (error) => {
        if (!cancelled) {
          setCatalogs({
            status: 'error',
            message: errorMessage(error, t('catalog.catalogsUnavailable')),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [catalogReload, controllers, t]);

  useEffect(() => {
    if (defaultCatalogName === undefined) return;
    let cancelled = false;
    controllers.listNamespaces(defaultCatalogName).then(
      (data) => {
        if (!cancelled) setDatabases({ status: 'loaded', data });
      },
      (error) => {
        if (!cancelled) {
          setDatabases({
            status: 'error',
            message: errorMessage(error, t('catalog.databasesUnavailable')),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [controllers, databaseReload, defaultCatalogName, t]);

  const availableDatabaseNames =
    databases?.status === 'loaded' ? databases.data.map((database) => database.name) : [];
  const effectiveDatabase = availableDatabaseNames.includes(selectedDatabase)
    ? selectedDatabase
    : (availableDatabaseNames[0] ?? '');

  useEffect(() => {
    if (view !== 'tables' || defaultCatalogName === undefined || effectiveDatabase === '') return;
    let cancelled = false;
    controllers.listTables(defaultCatalogName, effectiveDatabase).then(
      (data) => {
        if (!cancelled) setTables({ status: 'loaded', data });
      },
      (error) => {
        if (!cancelled) {
          setTables({
            status: 'error',
            message: errorMessage(error, t('catalog.tablesUnavailable')),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [controllers, defaultCatalogName, effectiveDatabase, t, tableReload, view]);

  useEffect(() => {
    if (!createOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isCreating) {
        setCreateOpen(false);
        createTrigger.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [createOpen, isCreating]);

  const filteredDatabases = useMemo(() => {
    if (databases?.status !== 'loaded') return [];
    const query = databaseFilter.trim().toLocaleLowerCase();
    return query === ''
      ? databases.data
      : databases.data.filter(
          (database) =>
            database.name.toLocaleLowerCase().includes(query) ||
            database.description?.toLocaleLowerCase().includes(query),
        );
  }, [databaseFilter, databases]);

  const filteredTables = useMemo(() => {
    if (tables?.status !== 'loaded') return [];
    const query = tableFilter.trim().toLocaleLowerCase();
    return query === ''
      ? tables.data
      : tables.data.filter((table) => table.name.toLocaleLowerCase().includes(query));
  }, [tableFilter, tables]);

  const openCreateDatabase = () => {
    if (defaultCatalog === undefined) return;
    createTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDatabaseName('');
    setDatabaseDescription('');
    setCreateError(undefined);
    setCreateOpen(true);
  };

  const closeCreateDatabase = () => {
    if (isCreating) return;
    setCreateOpen(false);
    createTrigger.current?.focus();
  };

  const createDatabase = async () => {
    if (isCreating || defaultCatalog === undefined) return;
    setIsCreating(true);
    setCreateError(undefined);
    try {
      const created = await controllers.createNamespace(
        defaultCatalog.name,
        databaseName.trim(),
        databaseDescription,
      );
      setCreatedMessage(t('catalog.databaseCreated', { name: created.name }));
      setCreatedDatabaseName(created.name);
      setCreateOpen(false);
      setDatabaseReload((current) => current + 1);
      createTrigger.current?.focus();
    } catch (error) {
      setCreateError(errorMessage(error, t('catalog.createDatabaseError')));
    } finally {
      setIsCreating(false);
    }
  };

  const openEditDescription = (database: NamespaceViewModel) => {
    setEditingDatabase(database);
    setEditDescription(database.description ?? '');
    setEditError(undefined);
  };

  const saveDescription = async () => {
    if (editingDatabase === undefined || isEditing) return;
    setIsEditing(true);
    setEditError(undefined);
    try {
      await controllers.updateNamespaceDescription(
        editingDatabase.catalog,
        editingDatabase.name,
        editDescription,
      );
      setCreatedMessage(t('catalog.databaseDescriptionUpdated', { name: editingDatabase.name }));
      setEditingDatabase(undefined);
      setDatabaseReload((current) => current + 1);
    } catch (error) {
      setEditError(errorMessage(error, t('catalog.updateDatabaseDescriptionError')));
    } finally {
      setIsEditing(false);
    }
  };

  const loadPanel = useCallback(
    <T,>(
      token: number,
      loader: () => Promise<T>,
      setState: (state: AsyncState<T>) => void,
      fallback: string,
    ) => {
      loader().then(
        (data) => {
          if (isCurrentRequestToken(selectionToken.current, token)) {
            setState({ status: 'loaded', data });
          }
        },
        (error) => {
          if (isCurrentRequestToken(selectionToken.current, token)) {
            setState({ status: 'error', message: errorMessage(error, fallback) });
          }
        },
      );
    },
    [],
  );

  const selectTable = useCallback(
    (table: TableSummaryViewModel, event?: DeviceEventSelection) => {
      const ref = { catalog: table.catalog, schema: table.schema, table: table.name };
      const token = ++selectionToken.current;
      previewMonitor.current?.close();
      previewMonitor.current = undefined;
      setSelected(ref);
      setDeviceEvent(event);
      setMetadata({ status: 'loading' });
      setSnapshots(event === undefined ? { status: 'loading' } : { status: 'loaded', data: [] });
      setPreview({ status: 'loading' });
      loadPanel(token, () => controllers.loadMetadata(ref), setMetadata, METADATA_ERROR);
      if (event === undefined) {
        loadPanel(token, () => controllers.listSnapshots(ref), setSnapshots, SNAPSHOTS_ERROR);
        loadPanel(token, () => controllers.preview(ref), setPreview, PREVIEW_ERROR);
        return;
      }
      previewMonitor.current = controllers.monitorPreview(
        { ...ref, deviceId: event.deviceId },
        {
          onSnapshot: (data) => {
            if (isCurrentRequestToken(selectionToken.current, token)) {
              setPreview({ status: 'loaded', data });
            }
          },
          onError: (error) => {
            if (isCurrentRequestToken(selectionToken.current, token)) {
              setPreview({ status: 'error', message: errorMessage(error, PREVIEW_ERROR) });
            }
          },
        },
      );
    },
    [controllers, loadPanel],
  );

  useEffect(
    () => () => {
      previewMonitor.current?.close();
    },
    [],
  );

  useEffect(() => {
    if (
      initialDeviceEvent === undefined ||
      initialDeviceEventApplied.current ||
      tables?.status !== 'loaded'
    ) {
      return;
    }
    const table = tables.data.find(
      (candidate) =>
        candidate.catalog === initialDeviceEvent.table.catalog &&
        candidate.schema === initialDeviceEvent.table.schema &&
        candidate.name === initialDeviceEvent.table.table,
    );
    if (table === undefined) return;
    initialDeviceEventApplied.current = true;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) selectTable(table, initialDeviceEvent);
    });
    return () => {
      cancelled = true;
    };
  }, [initialDeviceEvent, selectTable, tables]);

  const retryMetadata = () => {
    if (selected === undefined) return;
    setMetadata({ status: 'loading' });
    loadPanel(
      selectionToken.current,
      () => controllers.loadMetadata(selected),
      setMetadata,
      METADATA_ERROR,
    );
  };
  const retrySnapshots = () => {
    if (selected === undefined) return;
    setSnapshots({ status: 'loading' });
    loadPanel(
      selectionToken.current,
      () => controllers.listSnapshots(selected),
      setSnapshots,
      SNAPSHOTS_ERROR,
    );
  };
  const retryPreview = () => {
    if (selected === undefined) return;
    setPreview({ status: 'loading' });
    loadPanel(
      selectionToken.current,
      () =>
        controllers.preview({
          ...selected,
          ...(deviceEvent ? { deviceId: deviceEvent.deviceId } : {}),
        }),
      setPreview,
      PREVIEW_ERROR,
    );
  };

  return (
    <section className="grid gap-5">
      <PageBar
        actions={
          view === 'databases' ? (
            <Button
              data-tutorial-target="create-database"
              disabled={defaultCatalog === undefined}
              onClick={openCreateDatabase}
            >
              {t('catalog.createDatabase')}
            </Button>
          ) : undefined
        }
        description={t(
          view === 'databases'
            ? 'page.catalogDatabases.description'
            : 'page.catalogTables.description',
        )}
        title={t(view === 'databases' ? 'page.catalogDatabases.title' : 'page.catalogTables.title')}
      />

      {createdMessage ? (
        <div
          className="rounded-lg border border-status-success/30 bg-status-success-light px-4 py-3 text-body-sm text-status-success-dark"
          role="status"
        >
          {createdMessage}
        </div>
      ) : null}

      {catalogs.status === 'loading' ? <BlockLoading label={t('catalog.loadingCatalog')} /> : null}
      {catalogs.status === 'error' ? (
        <BlockError
          message={catalogs.message}
          onRetry={() => setCatalogReload((current) => current + 1)}
        />
      ) : null}
      {catalogs.status === 'loaded' && catalogs.data.length === 0 ? (
        <BlockEmpty
          title={t('catalog.noCatalog')}
          description={t('catalog.noCatalogDescription')}
        />
      ) : null}

      {defaultCatalog !== undefined && view === 'databases' ? (
        <DatabaseList
          databases={databases}
          filter={databaseFilter}
          filtered={filteredDatabases}
          onFilterChange={setDatabaseFilter}
          onEditDescription={openEditDescription}
          onRetry={() => setDatabaseReload((current) => current + 1)}
          tutorialDatabaseName={createdDatabaseName}
        />
      ) : null}

      {defaultCatalog !== undefined && view === 'tables' ? (
        <>
          <TableList
            databases={databases}
            filter={tableFilter}
            filtered={filteredTables}
            selectedDatabase={effectiveDatabase}
            tables={tables}
            onDatabaseChange={(database) => {
              previewMonitor.current?.close();
              setSelectedDatabase(database);
              setSelected(undefined);
              setDeviceEvent(undefined);
              setTables(undefined);
            }}
            onFilterChange={setTableFilter}
            onRetryDatabases={() => setDatabaseReload((current) => current + 1)}
            onRetryTables={() => setTableReload((current) => current + 1)}
            onSelectTable={(table) => selectTable(table)}
          />
          {selected && metadata && snapshots && preview ? (
            <Card className="gap-0 overflow-hidden py-0">
              <TableDetail
                table={selected}
                metadata={metadata}
                snapshots={snapshots}
                preview={preview}
                {...(deviceEvent === undefined ? {} : { liveDeviceName: deviceEvent.deviceName })}
                onRetryMetadata={retryMetadata}
                onRetrySnapshots={retrySnapshots}
                onRetryPreview={retryPreview}
              />
            </Card>
          ) : null}
        </>
      ) : null}

      {createOpen ? (
        <CreateDatabaseModal
          name={databaseName}
          description={databaseDescription}
          {...(createError ? { error: createError } : {})}
          isSubmitting={isCreating}
          onNameChange={setDatabaseName}
          onDescriptionChange={setDatabaseDescription}
          onCancel={closeCreateDatabase}
          onSubmit={() => void createDatabase()}
        />
      ) : null}

      {editingDatabase !== undefined ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !isEditing) setEditingDatabase(undefined);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t('catalog.editDatabaseDescriptionTitle', { name: editingDatabase.name })}
              </DialogTitle>
            </DialogHeader>
            <TextareaField
              autoFocus
              disabled={isEditing}
              label={t('catalog.databaseDescriptionLabel')}
              hint={t('catalog.databaseDescriptionHint')}
              maxLength={1000}
              rows={4}
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
            />
            {editError ? <InlineError>{editError}</InlineError> : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={isEditing}
                onClick={() => setEditingDatabase(undefined)}
              >
                {t('action.cancel')}
              </Button>
              <Button disabled={isEditing} onClick={() => void saveDescription()}>
                {isEditing ? <Spinner /> : null}
                {t('action.save')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}

function DatabaseList({
  databases,
  filter,
  filtered,
  onFilterChange,
  onEditDescription,
  onRetry,
  tutorialDatabaseName,
}: Readonly<{
  databases: AsyncState<readonly NamespaceViewModel[]> | undefined;
  filter: string;
  filtered: readonly NamespaceViewModel[];
  onFilterChange: (value: string) => void;
  onEditDescription: (database: NamespaceViewModel) => void;
  onRetry: () => void;
  readonly tutorialDatabaseName?: string;
}>) {
  const { t } = useTranslation();
  return (
    <Card className="gap-4 overflow-hidden p-5">
      <div>
        <h2 className="m-0 text-body-lg font-semibold">
          {t('catalog.databaseListTitle', {
            count: databases?.status === 'loaded' ? databases.data.length : 0,
          })}
        </h2>
        <p className="mt-1 text-caption text-muted-foreground">
          {t('catalog.databaseListDescription')}
        </p>
      </div>
      <TextField
        label={t('catalog.filterDatabases')}
        placeholder={t('catalog.filterDatabases')}
        value={filter}
        onChange={(event) => onFilterChange(event.target.value)}
      />
      {databases?.status === 'loading' || databases === undefined ? (
        <BlockLoading label={t('catalog.loadingDatabases')} />
      ) : null}
      {databases?.status === 'error' ? (
        <BlockError message={databases.message} onRetry={onRetry} />
      ) : null}
      {databases?.status === 'loaded' && databases.data.length === 0 ? (
        <BlockEmpty
          title={t('catalog.noDatabases')}
          description={t('catalog.noDatabasesDescription')}
        />
      ) : null}
      {databases?.status === 'loaded' && databases.data.length > 0 ? (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={headerCellClass} scope="col">
                  {t('catalog.name')}
                </th>
                <th className={headerCellClass} scope="col">
                  {t('catalog.description')}
                </th>
                <th className={headerCellClass} scope="col">
                  <span className="sr-only">{t('catalog.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((database) => (
                <tr className="hover:bg-accent" key={database.name}>
                  <td className={cn(bodyCellClass, 'font-[650]')}>
                    {/* The only way into a database. Its sources, pipelines,
                     * tables and runs are tabs inside it rather than separate
                     * destinations, so this list is the door to all four — a
                     * name rendered as plain text left them unreachable. */}
                    <Link
                      className="underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      data-tutorial-target={
                        tutorialDatabaseName === undefined || tutorialDatabaseName === database.name
                          ? 'tutorial-database'
                          : undefined
                      }
                      href={`/databases/${encodeURIComponent(database.name)}`}
                    >
                      {database.name}
                    </Link>
                  </td>
                  <td className={cn(bodyCellClass, 'text-muted-foreground')}>
                    {database.description ?? t('catalog.noDescription')}
                  </td>
                  <td className={cn(bodyCellClass, 'text-right')}>
                    <Button variant="outline" onClick={() => onEditDescription(database)}>
                      {t('catalog.editDescription')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <p className="m-0 px-4 py-8 text-center text-body-sm text-muted-foreground">
              {t('catalog.noMatchingDatabases')}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function TableList({
  databases,
  filter,
  filtered,
  selectedDatabase,
  tables,
  onDatabaseChange,
  onFilterChange,
  onRetryDatabases,
  onRetryTables,
  onSelectTable,
}: Readonly<{
  databases: AsyncState<readonly NamespaceViewModel[]> | undefined;
  filter: string;
  filtered: readonly TableSummaryViewModel[];
  selectedDatabase: string;
  tables: AsyncState<readonly TableSummaryViewModel[]> | undefined;
  onDatabaseChange: (value: string) => void;
  onFilterChange: (value: string) => void;
  onRetryDatabases: () => void;
  onRetryTables: () => void;
  onSelectTable: (table: TableSummaryViewModel) => void;
}>) {
  const { t } = useTranslation();
  const databaseOptions = databases?.status === 'loaded' ? databases.data : [];
  return (
    <Card className="gap-4 overflow-hidden p-5">
      <div>
        <h2 className="m-0 text-body-lg font-semibold">
          {t('catalog.tableListTitle', {
            count: tables?.status === 'loaded' ? tables.data.length : 0,
          })}
        </h2>
        <p className="mt-1 text-caption text-muted-foreground">
          {t('catalog.tableListDescription')}
        </p>
      </div>
      {databases?.status === 'loading' || databases === undefined ? (
        <BlockLoading label={t('catalog.loadingDatabases')} />
      ) : null}
      {databases?.status === 'error' ? (
        <BlockError message={databases.message} onRetry={onRetryDatabases} />
      ) : null}
      {databases?.status === 'loaded' && databases.data.length === 0 ? (
        <BlockEmpty
          title={t('catalog.noDatabases')}
          description={t('catalog.noDatabasesDescription')}
        />
      ) : null}
      {databaseOptions.length > 0 ? (
        <>
          <SelectField
            data={databaseOptions.map((database) => ({
              label: database.name,
              value: database.name,
            }))}
            label={t('catalog.chooseDatabase')}
            value={selectedDatabase}
            onChange={onDatabaseChange}
          />
          <TextField
            label={t('catalog.filterTables')}
            placeholder={t('catalog.filterTables')}
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
          />
          {tables?.status === 'loading' || tables === undefined ? (
            <BlockLoading label={t('catalog.loadingTables')} />
          ) : null}
          {tables?.status === 'error' ? (
            <BlockError message={tables.message} onRetry={onRetryTables} />
          ) : null}
          {tables?.status === 'loaded' && tables.data.length === 0 ? (
            <BlockEmpty
              title={t('catalog.noTables')}
              description={t('catalog.noTablesDescription')}
            />
          ) : null}
          {tables?.status === 'loaded' && tables.data.length > 0 ? (
            <div className="overflow-auto rounded-lg border border-border">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={headerCellClass} scope="col">
                      {t('catalog.name')}
                    </th>
                    <th className={headerCellClass} scope="col">
                      {t('catalog.database')}
                    </th>
                    <th className={headerCellClass} scope="col">
                      {t('catalog.type')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((table) => (
                    <tr className="hover:bg-accent" key={`${table.schema}.${table.name}`}>
                      <td className={bodyCellClass}>
                        <button
                          className="font-[650] text-primary hover:underline"
                          onClick={() => onSelectTable(table)}
                          type="button"
                        >
                          {table.name}
                        </button>
                      </td>
                      <td className={bodyCellClass}>{table.schema}</td>
                      <td className={bodyCellClass}>{table.tableType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 ? (
                <p className="m-0 px-4 py-8 text-center text-body-sm text-muted-foreground">
                  {t('catalog.noMatchingTables')}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

const METADATA_ERROR = 'Column metadata could not be loaded.';
const SNAPSHOTS_ERROR = 'Snapshots could not be loaded.';
const PREVIEW_ERROR = 'Preview rows could not be loaded.';
