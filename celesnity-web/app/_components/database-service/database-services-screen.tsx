'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type {
  DatabaseServiceConnectorDescriptor,
  DatabaseServiceDetailsInput,
  DatabaseServiceInput,
  DatabaseServiceUpdateInput,
} from '@/src/entities/models/database-service';
import type {
  DatabaseServiceVerificationViewModel,
  DatabaseServiceViewModel,
} from '@/src/interface-adapters/presenters/database-service.presenter';
import type { MetadataCrawlerController } from '@/src/interface-adapters/controllers/metadata-crawler/metadata-crawler.controller';
import type { MetadataCrawler } from '@/src/entities/models/metadata-crawler';
import { Button } from '@/app/_components/ui/button';
import { PageBar } from '@/app/_components/ui/page-bar';
import { Pager } from '@/app/_components/ui/pager';
import { cn } from '@/app/_components/ui/utils';
import { InlineError, PageAlert } from '@/app/_components/ui/page-alert';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { Spinner } from '@/app/_components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_components/ui/dialog';
import { Card } from '@/app/_components/ui/card';
import { useTranslation } from '@/app/_i18n/use-translation';
import { DatabaseServiceForm } from './database-service-form';
import { DatabaseServiceList } from './database-service-list';
import { ExistingDatabaseSourcePicker } from './existing-database-source-picker';

const panelHeadingClass = 'm-0 text-title';
const stateMarkClass =
  'mb-[15px] grid size-[42px] place-items-center rounded-xl text-title font-semibold';
const stateCopyClass =
  'mt-2 mb-[18px] max-w-[390px] text-body-sm leading-[1.55] text-muted-foreground';
const centeredStateClass =
  'flex min-h-[320px] flex-col items-center justify-center px-6 py-9 text-center';

type EditorState =
  | { readonly kind: 'create'; readonly key: number }
  | { readonly kind: 'loading'; readonly id: string; readonly key: number }
  | { readonly kind: 'error'; readonly id: string; readonly key: number }
  | { readonly kind: 'edit'; readonly service: DatabaseServiceViewModel; readonly key: number };

interface DatabaseServicesScreenProps {
  /** Restricts the page to the sources filed under one Iceberg database. */
  readonly databaseName?: string;
  /** Rendered inside the database screen, which already supplies a heading. */
  readonly embedded?: boolean;
  readonly controllers: Readonly<{
    list: (query?: { readonly page?: number; readonly databaseName?: string }) => Promise<{
      readonly items: readonly DatabaseServiceViewModel[];
      readonly page: number;
      readonly pageSize: number;
      readonly total: number;
    }>;
    listAvailable: (query: {
      readonly databaseName: string;
      readonly page?: number;
      readonly pageSize?: number;
      readonly search?: string;
    }) => Promise<{
      readonly items: readonly DatabaseServiceViewModel[];
      readonly page: number;
      readonly pageSize: number;
      readonly total: number;
    }>;
    listConnectors: () => Promise<readonly DatabaseServiceConnectorDescriptor[]>;
    get: (id: string) => Promise<DatabaseServiceViewModel>;
    testUnsaved: (
      connectorType: string,
      details: DatabaseServiceDetailsInput,
    ) => Promise<DatabaseServiceVerificationViewModel>;
    testSaved: (id: string) => Promise<DatabaseServiceVerificationViewModel>;
    create: (input: DatabaseServiceInput) => Promise<DatabaseServiceViewModel>;
    update: (id: string, input: DatabaseServiceUpdateInput) => Promise<DatabaseServiceViewModel>;
    archive: (id: string) => Promise<void>;
    attach: (id: string, databaseName: string) => Promise<void>;
    detach: (id: string, databaseName: string) => Promise<void>;
    metadataCrawler: MetadataCrawlerController;
  }>;
}

export function DatabaseServicesScreen({
  controllers,
  databaseName,
  embedded = false,
}: DatabaseServicesScreenProps) {
  const { t } = useTranslation();
  const [crawlersByServiceId, setCrawlersByServiceId] = useState<
    Readonly<Record<string, MetadataCrawler>>
  >({});
  const editorSequence = useRef(0);
  // The screen held `page`/`pageSize`/`total` and asked only ever for page 1,
  // with no pager rendered: past one page the count contradicted the rows and
  // there was no way to reach the rest.
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<{
    readonly items: readonly DatabaseServiceViewModel[];
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  }>();
  const [descriptors, setDescriptors] = useState<readonly DatabaseServiceConnectorDescriptor[]>();
  const [loadError, setLoadError] = useState(false);
  const [editor, setEditor] = useState<EditorState>();
  const [archiveTarget, setArchiveTarget] = useState<DatabaseServiceViewModel>();
  const [isArchiving, setIsArchiving] = useState(false);
  const [detachTarget, setDetachTarget] = useState<DatabaseServiceViewModel>();
  const [isDetaching, setIsDetaching] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogMode, setAddDialogMode] = useState<'choice' | 'existing'>('choice');
  const [availablePage, setAvailablePage] = useState<{
    readonly items: readonly DatabaseServiceViewModel[];
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  }>();
  const [availableSearch, setAvailableSearch] = useState('');
  const [availableLoading, setAvailableLoading] = useState(false);
  const [availableError, setAvailableError] = useState<string>();
  const [addingId, setAddingId] = useState<string>();
  const [testingIds, setTestingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [savedTestResults, setSavedTestResults] = useState<
    Readonly<Record<string, DatabaseServiceVerificationViewModel>>
  >({});
  const [actionError, setActionError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [createdServiceId, setCreatedServiceId] = useState<string>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedEdit = searchParams.get('edit');
  const requestedCreate = searchParams.get('create') === 'true';
  const openedFromUrl = useRef<string | undefined>(undefined);
  const openedCreateFromUrl = useRef(false);

  const setCreateRouteOpen = useCallback(
    (open: boolean) => {
      const next = new URLSearchParams(searchParams.toString());
      if (open) next.set('create', 'true');
      else next.delete('create');
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const load = async () => {
    setLoadError(false);
    try {
      const [nextPage, nextDescriptors] = await Promise.all([
        controllers.list({ page: pageNumber, ...(databaseName ? { databaseName } : {}) }),
        controllers.listConnectors(),
      ]);
      setPage(nextPage);
      setDescriptors(nextDescriptors);
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [nextPage, nextDescriptors] = await Promise.all([
          controllers.list({ page: pageNumber, ...(databaseName ? { databaseName } : {}) }),
          controllers.listConnectors(),
        ]);
        if (!cancelled) {
          setPage(nextPage);
          setDescriptors(nextDescriptors);
        }
      } catch {
        if (!cancelled) {
          setLoadError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [controllers, databaseName, pageNumber]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await controllers.metadataCrawler.list();
        if (!cancelled) {
          setCrawlersByServiceId(
            Object.fromEntries(page.items.map((crawler) => [crawler.databaseServiceId, crawler])),
          );
        }
      } catch {
        // Loaded separately and failing quietly: a scan that cannot be read is
        // not a reason to withhold the connections, which is what this screen
        // is for. The scan screen reports the failure where it is actionable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [controllers, databaseName]);

  const openCreateEditor = () => {
    const key = ++editorSequence.current;
    setEditor({ kind: 'create', key });
    setActionError(undefined);
    openedCreateFromUrl.current = true;
    setCreateRouteOpen(true);
  };

  const openAddDialog = () => {
    setAddDialogMode('choice');
    setAddDialogOpen(true);
    setAvailableSearch('');
    setAvailablePage(undefined);
    setAvailableError(undefined);
  };

  const loadAvailable = async (search = availableSearch) => {
    if (databaseName === undefined) return;
    setAvailableLoading(true);
    setAvailableError(undefined);
    try {
      setAvailablePage(
        await controllers.listAvailable({
          databaseName,
          page: 1,
          pageSize: 50,
          ...(search.trim() ? { search: search.trim() } : {}),
        }),
      );
    } catch {
      setAvailableError(t('databaseServices.availableError'));
    } finally {
      setAvailableLoading(false);
    }
  };

  const showExistingSources = () => {
    setAddDialogMode('existing');
    void loadAvailable('');
  };

  const attachSource = async (service: DatabaseServiceViewModel) => {
    if (databaseName === undefined) return;
    setAddingId(service.id);
    try {
      await controllers.attach(service.id, databaseName);
      setAddDialogOpen(false);
      setNotice(t('databaseServices.addedToDatabase', { name: service.name }));
      await load();
    } catch {
      setAvailableError(t('databaseServices.addError'));
    } finally {
      setAddingId(undefined);
    }
  };

  const closeEditor = () => {
    editorSequence.current += 1;
    setEditor(undefined);
    setCreateRouteOpen(false);
  };

  const openEditor = async (id: string) => {
    const key = ++editorSequence.current;
    setEditor({ kind: 'loading', id, key });
    setActionError(undefined);
    try {
      const service = await controllers.get(id);
      if (editorSequence.current === key) setEditor({ kind: 'edit', service, key });
    } catch {
      if (editorSequence.current === key) setEditor({ kind: 'error', id, key });
    }
  };

  // `?edit=<id>` opens the editor for one source, so the source's own screen
  // can offer Edit without owning a second copy of the form. The param is
  // dropped once honoured: closing the editor must not reopen it, and the URL
  // a visitor copies should not carry a transient panel.
  useEffect(() => {
    if (requestedEdit === null || openedFromUrl.current === requestedEdit) return;
    openedFromUrl.current = requestedEdit;
    void openEditor(requestedEdit);
    const next = new URLSearchParams(searchParams.toString());
    next.delete('edit');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // `openEditor` is stable enough for this one-shot: it is recreated per
    // render but the guard above runs once per requested id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, requestedEdit, router, searchParams]);

  // Creating a source is a resumable tutorial destination, not only local
  // component state. Keeping it in the URL lets a paused walkthrough restore
  // the form and its Save control after navigation or a page reload.
  useEffect(() => {
    if (!requestedCreate) {
      openedCreateFromUrl.current = false;
      return;
    }
    if (openedCreateFromUrl.current || editor !== undefined) return;
    openedCreateFromUrl.current = true;
    const key = ++editorSequence.current;
    setEditor({ kind: 'create', key });
    setActionError(undefined);
  }, [editor, requestedCreate]);

  const saveService = (input: DatabaseServiceInput | DatabaseServiceUpdateInput) =>
    editor?.kind === 'edit'
      ? controllers.update(editor.service.id, input)
      : controllers.create(input as DatabaseServiceInput);

  const finishSave = (saved: DatabaseServiceViewModel, key: number) => {
    // A source saved under a different database (or under none) is not part of
    // this list, and showing it anyway was how the screen lied: the row sat
    // there until the next load, then vanished mid-task with no explanation.
    // Testing the connection was usually what triggered that load.
    const savedDatabaseNames =
      saved.databaseNames ?? (saved.databaseName ? [saved.databaseName] : []);
    const belongsHere = databaseName === undefined || savedDatabaseNames.includes(databaseName);
    if (!belongsHere) {
      setNotice(t('databaseServices.savedElsewhere', { name: saved.name }));
      setEditor((current) => (current?.key === key ? undefined : current));
      setCreateRouteOpen(false);
      return;
    }
    setNotice(undefined);
    setCreatedServiceId(saved.id);
    setPage((current) => {
      if (!current) return current;
      const items = current.items.some((item) => item.id === saved.id)
        ? current.items.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...current.items];
      return {
        ...current,
        items,
        total: current.total + (current.items.some((item) => item.id === saved.id) ? 0 : 1),
      };
    });
    setEditor((current) => (current?.key === key ? undefined : current));
    setCreateRouteOpen(false);
    setSavedTestResults((current) => {
      const next = { ...current };
      delete next[saved.id];
      return next;
    });
  };

  const testSaved = async (id: string) => {
    if (testingIds.has(id)) return;
    setTestingIds((current) => new Set(current).add(id));
    try {
      const result = await controllers.testSaved(id);
      setSavedTestResults((current) => ({ ...current, [id]: result }));
      await load();
    } catch {
      setActionError(t('databaseServices.testError'));
    } finally {
      setTestingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const archive = async () => {
    if (!archiveTarget) return;
    setIsArchiving(true);
    try {
      await controllers.archive(archiveTarget.id);
      setArchiveTarget(undefined);
      if (editor?.kind === 'edit' && editor.service.id === archiveTarget.id) closeEditor();
      await load();
    } catch {
      setActionError(t('databaseServices.archiveError'));
    } finally {
      setIsArchiving(false);
    }
  };

  const detach = async () => {
    if (!detachTarget || databaseName === undefined) return;
    setIsDetaching(true);
    try {
      await controllers.detach(detachTarget.id, databaseName);
      setDetachTarget(undefined);
      if (editor?.kind === 'edit' && editor.service.id === detachTarget.id) closeEditor();
      await load();
    } catch {
      setActionError(t('databaseServices.removeError'));
    } finally {
      setIsDetaching(false);
    }
  };

  const connectorLabels = Object.fromEntries(
    (descriptors ?? []).map((item) => [item.connectorType, item.label]),
  );
  const services = page?.items;
  const hasEditor = editor !== undefined;

  return (
    <section className="grid gap-5">
      {/* Embedded, the database screen already names the page; only the action
       * has to survive, or there is no way to add a source at all. */}
      {embedded ? (
        <div className="flex justify-end">
          <Button
            data-tutorial-target="new-database-source"
            onClick={embedded ? openAddDialog : openCreateEditor}
          >
            {embedded ? t('databaseServices.addDatasource') : t('databaseServices.newConnection')}
          </Button>
        </div>
      ) : (
        <PageBar
          actions={
            <Button data-tutorial-target="new-database-source" onClick={openCreateEditor}>
              {t('databaseServices.newConnection')}
            </Button>
          }
          description={t('page.databaseServices.description')}
          eyebrow={
            <>
              {t('nav.group.data')} · {t('nav.databases')}
            </>
          }
          title={t('page.databaseServices.title')}
        />
      )}

      {actionError && !archiveTarget ? (
        <PageAlert
          dismissLabel={t('databaseServices.dismiss')}
          onDismiss={() => setActionError(undefined)}
        >
          {actionError}
        </PageAlert>
      ) : null}

      {notice ? (
        <PageAlert
          dismissLabel={t('databaseServices.dismiss')}
          onDismiss={() => setNotice(undefined)}
          tone="warning"
        >
          {notice}
        </PageAlert>
      ) : null}

      <div
        className={cn(
          'min-w-0',
          hasEditor &&
            'grid items-start gap-5 min-[1081px]:grid-cols-[minmax(0,1.04fr)_minmax(390px,0.96fr)]',
        )}
      >
        <Card className="p-[18px] md:p-[22px]">
          {!services && !loadError ? (
            <div
              className="grid min-h-[290px] place-items-center content-center gap-[9px] text-body-sm text-muted-foreground"
              aria-label={t('databaseServices.loading')}
              role="status"
            >
              <Skeleton className="h-[15px] w-[min(100%,460px)]" />
              <Skeleton className="h-[15px] w-[min(86%,395px)]" />
              <p>{t('databaseServices.loading')}</p>
            </div>
          ) : null}
          {loadError ? (
            <div className={centeredStateClass}>
              <span className={cn(stateMarkClass, 'bg-destructive/15 text-destructive')}>!</span>
              <h3 className="m-0 text-body-md">{t('databaseServices.loadError')}</h3>
              <p className={stateCopyClass}>{t('databaseServices.loadErrorHint')}</p>
              <Button variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : null}
          {services?.length === 0 ? (
            <div className={centeredStateClass}>
              <span className={cn(stateMarkClass, 'bg-accent text-primary')}>↗</span>
              <h3 className="m-0 text-body-md">{t('databaseServices.empty')}</h3>
              {/* Says which list is empty. Embedded in a database, this panel
               * shows a filtered page, and copy that claimed workspace scope
               * read as a failure to anyone who had just added a connection. */}
              <p className={stateCopyClass}>{t('databaseServices.emptyHint')}</p>
              <Button
                data-tutorial-target="new-database-source"
                onClick={embedded ? openAddDialog : openCreateEditor}
              >
                {embedded ? t('databaseServices.addDatasource') : t('databaseServices.addFirst')}
              </Button>
            </div>
          ) : null}
          {services && services.length > 0 ? (
            <DatabaseServiceList
              crawlersByServiceId={crawlersByServiceId}
              databaseName={databaseName}
              databaseServices={services}
              connectorLabels={connectorLabels}
              tutorialServiceId={createdServiceId}
              savedTestResults={savedTestResults}
              testingIds={testingIds}
              onEdit={openEditor}
              onTest={testSaved}
              onArchive={setArchiveTarget}
              onDetach={setDetachTarget}
            />
          ) : null}

          {page && page.total > page.pageSize ? (
            <div className="pt-4">
              <Pager
                ariaLabel={t('databaseServices.pagesLabel')}
                onChange={setPageNumber}
                page={page.page}
                total={Math.ceil(page.total / page.pageSize)}
              />
            </div>
          ) : null}
        </Card>

        {editor ? (
          <Card
            className="gap-0 py-0 row-start-1 overflow-hidden min-[1081px]:sticky min-[1081px]:top-[22px] min-[1081px]:row-auto"
            asChild
          >
            <aside aria-label={t('databaseServices.editorLabel')}>
              {editor.kind === 'loading' ? (
                <div className={centeredStateClass} role="status">
                  <Spinner className="size-7 text-primary" />
                  <h2 className={panelHeadingClass}>{t('databaseServices.editorLoading')}</h2>
                </div>
              ) : null}
              {editor.kind === 'error' ? (
                <div className={centeredStateClass} role="alert">
                  <span className={cn(stateMarkClass, 'bg-destructive/15 text-destructive')}>
                    !
                  </span>
                  <h2 className={panelHeadingClass}>{t('databaseServices.editorError')}</h2>
                  <Button variant="outline" onClick={closeEditor}>
                    Close
                  </Button>
                </div>
              ) : null}
              {editor.kind === 'create' || editor.kind === 'edit' ? (
                <DatabaseServiceForm
                  key={editor.key}
                  mode={editor.kind}
                  initialDatabaseName={databaseName}
                  descriptors={descriptors ?? []}
                  {...(editor.kind === 'edit' ? { initialService: editor.service } : {})}
                  onTest={(connectorType, details) =>
                    controllers.testUnsaved(connectorType, details)
                  }
                  onSave={saveService}
                  onSaved={(saved) => finishSave(saved, editor.key)}
                  onCancel={closeEditor}
                />
              ) : null}
            </aside>
          </Card>
        ) : null}
      </div>

      {archiveTarget ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setArchiveTarget(undefined);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t('databaseServices.archiveTitle', { name: archiveTarget.name })}
              </DialogTitle>
            </DialogHeader>
            <p className="mb-6 text-body-sm text-muted-foreground">
              {t('databaseServices.archiveBody')}
            </p>
            {actionError ? <InlineError>{actionError}</InlineError> : null}

            <div className="mt-4 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button
                variant="outline"
                disabled={isArchiving}
                onClick={() => setArchiveTarget(undefined)}
              >
                {t('databaseServices.keep')}
              </Button>
              <Button variant="destructive" disabled={isArchiving} onClick={() => void archive()}>
                {isArchiving ? t('databaseServices.archiving') : t('databaseServices.archive')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {detachTarget && databaseName ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setDetachTarget(undefined);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t('databaseServices.removeTitle', { name: detachTarget.name })}
              </DialogTitle>
            </DialogHeader>
            <p className="mb-6 text-body-sm text-muted-foreground">
              {t('databaseServices.removeBody')}
            </p>
            {actionError ? <InlineError>{actionError}</InlineError> : null}
            <div className="mt-4 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button
                variant="outline"
                disabled={isDetaching}
                onClick={() => setDetachTarget(undefined)}
              >
                {t('databaseServices.keep')}
              </Button>
              <Button variant="destructive" disabled={isDetaching} onClick={() => void detach()}>
                {isDetaching ? t('databaseServices.removing') : t('databaseServices.remove')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {databaseName && addDialogOpen ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setAddDialogOpen(false);
          }}
        >
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{t('databaseServices.addDatasource')}</DialogTitle>
            </DialogHeader>
            {addDialogMode === 'choice' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  className="rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent"
                  onClick={() => {
                    setAddDialogOpen(false);
                    openCreateEditor();
                  }}
                  type="button"
                >
                  <span className="block text-body-sm font-medium">
                    {t('databaseServices.addNewDatasource')}
                  </span>
                  <span className="mt-1 block text-caption text-muted-foreground">
                    {t('databaseServices.addNewDatasourceHint')}
                  </span>
                </button>
                <button
                  className="rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent"
                  onClick={showExistingSources}
                  type="button"
                >
                  <span className="block text-body-sm font-medium">
                    {t('databaseServices.chooseExistingDatasource')}
                  </span>
                  <span className="mt-1 block text-caption text-muted-foreground">
                    {t('databaseServices.chooseExistingDatasourceHint')}
                  </span>
                </button>
              </div>
            ) : (
              <ExistingDatabaseSourcePicker
                addingId={addingId}
                error={availableError}
                loading={availableLoading}
                onAdd={(service) => void attachSource(service)}
                onSearch={(value) => {
                  setAvailableSearch(value);
                  void loadAvailable(value);
                }}
                search={availableSearch}
                services={availablePage?.items ?? []}
              />
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
