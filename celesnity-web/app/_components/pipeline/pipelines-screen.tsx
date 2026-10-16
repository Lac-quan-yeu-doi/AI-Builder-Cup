'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { contextualErrorMessage } from '@/app/_components/shared/error-message';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { PageBar } from '@/app/_components/ui/page-bar';
import { CopyIcon, MoreHorizontalIcon, Trash2Icon } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { IconButton } from '@/app/_components/ui/icon-button';
import { Item, ItemContent, ItemTitle } from '@/app/_components/ui/item';
import { useTranslation } from '@/app/_i18n/use-translation';
import { SearchField } from '@/app/_components/ui/search-field';
import { SelectField, TextField } from '@/app/_components/ui/fields';
import { InlineError, PageAlert } from '@/app/_components/ui/page-alert';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_components/ui/dialog';
import { Card } from '@/app/_components/ui/card';
import type { ArchivePipelineController } from '@/src/interface-adapters/controllers/pipelines/archive-pipeline.controller';
import type { ClonePipelineController } from '@/src/interface-adapters/controllers/pipelines/clone-pipeline.controller';
import type { CreatePipelineController } from '@/src/interface-adapters/controllers/pipelines/create-pipeline.controller';
import type { GetPipelineController } from '@/src/interface-adapters/controllers/pipelines/get-pipeline.controller';
import type { ListPipelinesController } from '@/src/interface-adapters/controllers/pipelines/list-pipelines.controller';
import type { SavePipelineController } from '@/src/interface-adapters/controllers/pipelines/save-pipeline.controller';
import type {
  PipelinePageViewModel,
  PipelineSummaryViewModel,
} from '@/src/interface-adapters/presenters/pipeline.presenter';

const SEARCH_DEBOUNCE_MS = 300;
const LIST_FALLBACK = 'Confirm the Core API is running, then reload the pipeline list.';

interface PipelinesScreenProps {
  /**
   * When present, the Iceberg database this catalog-embedded list belongs to.
   * Without it, the screen manages pipelines across the whole workspace.
   */
  readonly databaseName?: string;
  /** Rendered inside the database screen, which already supplies a heading. */
  readonly embedded?: boolean;
  readonly controllers: Readonly<{
    list: ListPipelinesController;
    create: CreatePipelineController;
    clone: ClonePipelineController;
    archive: ArchivePipelineController;
    /** Present where a pipeline can be filed under this database. */
    get?: GetPipelineController;
    save?: SavePipelineController;
    listDatabases?: () => Promise<readonly string[]>;
  }>;
}

type Dialog =
  | { readonly kind: 'create' }
  | { readonly kind: 'clone'; readonly pipeline: PipelineSummaryViewModel }
  | { readonly kind: 'archive'; readonly pipeline: PipelineSummaryViewModel };

export function PipelinesScreen({
  controllers,
  databaseName,
  embedded = false,
}: PipelinesScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const requestSequence = useRef(0);
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [page, setPage] = useState<PipelinePageViewModel>();
  const [listError, setListError] = useState(false);
  const [unfiled, setUnfiled] = useState<readonly PipelineSummaryViewModel[]>([]);
  const [filingId, setFilingId] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [dialog, setDialog] = useState<Dialog>();
  const [dialogName, setDialogName] = useState('');
  const [dialogDatabaseName, setDialogDatabaseName] = useState(databaseName ?? '');
  const [databases, setDatabases] = useState<readonly string[] | undefined>(
    databaseName ? [databaseName] : undefined,
  );
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedKeyword(keyword.trim());
      setPageNumber(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    const request = ++requestSequence.current;
    let cancelled = false;

    controllers
      .list({
        page: pageNumber,
        pageSize: 100,
        ...(appliedKeyword ? { keyword: appliedKeyword } : {}),
      })
      .then((result) => {
        if (!cancelled && requestSequence.current === request) {
          // Filtered here rather than by Core: a pipeline belongs to a database
          // either by where it was filed or by where its graph writes, and the
          // list endpoint knows nothing about that pairing.
          setPage(
            databaseName
              ? {
                  ...result,
                  items: result.items.filter(
                    (pipeline) =>
                      pipeline.databaseName === databaseName ||
                      pipeline.targetDatabase === databaseName,
                  ),
                }
              : result,
          );
          // A pipeline filed nowhere is invisible in every database, while the
          // name it took stays taken. The container that could adopt it is the
          // only place with a reason to offer that.
          setUnfiled(
            databaseName
              ? result.items.filter(
                  (pipeline) =>
                    pipeline.databaseName === undefined && pipeline.targetDatabase === undefined,
                )
              : [],
          );
          setListError(false);
        }
      })
      .catch(() => {
        if (!cancelled && requestSequence.current === request) {
          setListError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [controllers, appliedKeyword, databaseName, pageNumber, reloadToken]);

  useEffect(() => {
    if (databaseName || !controllers.listDatabases) return;
    let cancelled = false;
    controllers
      .listDatabases()
      .then((items) => {
        if (!cancelled) {
          setDatabases(items);
          setDialogDatabaseName((current) => current || items[0] || '');
        }
      })
      .catch(() => {
        if (!cancelled) setDatabases([]);
      });
    return () => {
      cancelled = true;
    };
  }, [controllers, databaseName]);

  /** Re-runs the load effect even when the keyword and page are unchanged. */
  const reload = () => setReloadToken((token) => token + 1);

  const fileHere = async (pipeline: PipelineSummaryViewModel) => {
    const { get, save } = controllers;
    if (databaseName === undefined || get === undefined || save === undefined || filingId) return;
    setFilingId(pipeline.id);
    setActionError(undefined);
    try {
      // Read then write: the save endpoint is optimistic on version and takes
      // the whole draft, so the graph has to come back before it goes out.
      const current = await get(pipeline.id);
      await save(pipeline.id, {
        name: current.name,
        databaseName,
        graph: current.graph,
        version: current.version,
        ...(current.description ? { description: current.description } : {}),
      });
      setReloadToken((token) => token + 1);
    } catch (error) {
      setActionError(contextualErrorMessage(error, t('pipeline.fileError')));
    } finally {
      setFilingId(undefined);
    }
  };

  const openDialog = (next: Dialog) => {
    setActionError(undefined);
    setDialogName(next.kind === 'clone' ? `${next.pipeline.name} copy` : '');
    if (next.kind === 'create') {
      setDialogDatabaseName(databaseName ?? databases?.[0] ?? '');
    }
    setDialog(next);
  };

  const closeDialog = () => {
    setDialog(undefined);
    setDialogName('');
    setDialogDatabaseName(databaseName ?? databases?.[0] ?? '');
  };

  const confirmDialog = async () => {
    if (!dialog || isBusy) {
      return;
    }

    setIsBusy(true);
    setActionError(undefined);
    try {
      if (dialog.kind === 'archive') {
        await controllers.archive(dialog.pipeline.id);
        closeDialog();
        reload();
        return;
      }

      const destinationDatabase =
        dialog.kind === 'clone'
          ? (dialog.pipeline.databaseName ?? dialog.pipeline.targetDatabase)
          : (databaseName ?? dialogDatabaseName);
      if (!destinationDatabase) {
        setActionError('Choose a Data Catalog database for this pipeline.');
        return;
      }
      const created =
        dialog.kind === 'create'
          ? await controllers.create({
              name: dialogName.trim(),
              databaseName: destinationDatabase,
              graph: { nodes: [], edges: [] },
            })
          : await controllers.clone(dialog.pipeline.id, dialogName.trim());
      closeDialog();
      router.push(`/databases/${encodeURIComponent(destinationDatabase)}/pipelines/${created.id}`);
    } catch (error) {
      setActionError(contextualErrorMessage(error, 'The request could not be completed.'));
    } finally {
      setIsBusy(false);
    }
  };

  const isLoading = !page && !listError;
  // Eight is where scanning a list starts to lose to typing a name.
  const showSearch = keyword !== '' || (page?.totalItems ?? 0) > 8;
  const canSubmitDialog =
    dialog?.kind === 'archive' ||
    (dialogName.trim().length > 0 &&
      (dialog?.kind === 'clone' || Boolean(databaseName ?? dialogDatabaseName)));

  return (
    <section className="grid gap-5">
      {embedded ? (
        <div className="flex justify-end">
          <Button disabled={isBusy} onClick={() => openDialog({ kind: 'create' })}>
            New pipeline
          </Button>
        </div>
      ) : (
        <PageBar
          actions={
            <Button disabled={isBusy} onClick={() => openDialog({ kind: 'create' })}>
              New pipeline
            </Button>
          }
          description={t('page.pipelines.description')}
          title={t('page.pipelines.title')}
        />
      )}

      {actionError && !dialog ? (
        <PageAlert dismissLabel="Dismiss message" onDismiss={() => setActionError(undefined)}>
          {actionError}
        </PageAlert>
      ) : null}

      {listError ? (
        <div
          className="flex flex-col items-stretch gap-[18px] rounded-lg border border-destructive/30 bg-destructive/10 px-[15px] py-3 text-body-sm leading-[1.5] text-destructive md:flex-row md:items-center md:justify-between"
          role="alert"
        >
          <div>
            <strong className="block">The pipeline list is unavailable.</strong>
            <p className="mt-[3px]">{LIST_FALLBACK}</p>
          </div>
          <Button variant="outline" onClick={reload}>
            Retry
          </Button>
        </div>
      ) : null}

      <Card className="p-[18px] md:p-6">
        {/* A search box above a single row is chrome pretending to be a
         * control. It appears once the list is long enough to need filtering,
         * and stays once a keyword is typed so it can be cleared. */}
        {showSearch ? (
          <SearchField
            className="max-w-[520px]"
            label={t('pipeline.search')}
            onChange={(event) => setKeyword(event.target.value)}
            onClear={() => setKeyword('')}
            placeholder={t('pipeline.searchPlaceholder')}
            value={keyword}
          />
        ) : null}

        {isLoading ? (
          <div className="mt-5 grid gap-3" role="status" aria-label="Loading pipelines">
            <Skeleton className="h-[120px] rounded-xl" />
            <Skeleton className="h-[120px] rounded-xl" />
          </div>
        ) : null}

        {page && page.items.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-border px-5 py-[42px] text-center">
            <strong className="block text-body-sm">
              {appliedKeyword ? 'No pipeline matches that name' : 'No pipelines yet'}
            </strong>
            <p className="mx-auto mt-[9px] max-w-[420px] text-caption leading-[1.6] text-muted-foreground">
              {appliedKeyword
                ? 'Clear the search to see every pipeline in this workspace.'
                : 'Create one to open the flow canvas and drop your first source node.'}
            </p>
          </div>
        ) : null}

        {/* Rows, and the row is the link. The card grid wasted the page width on
         * three columns of label/value pairs, and its primary action was a
         * button labelled "Flow Canvas" — a noun for the destination, where
         * clicking the pipeline should simply open it. */}
        {page && page.items.length > 0 ? (
          <div className="mt-5 divide-y divide-border">
            {page.items.map((pipeline) => (
              <Item className="flex-nowrap gap-3" key={pipeline.id} size="sm">
                <ItemContent className="min-w-0">
                  <ItemTitle className="gap-2">
                    <Link
                      className="truncate hover:text-primary"
                      href={`/databases/${encodeURIComponent(
                        pipeline.databaseName ?? pipeline.targetDatabase ?? databaseName ?? '',
                      )}/pipelines/${pipeline.id}`}
                    >
                      {pipeline.name}
                    </Link>
                    <Badge variant="secondary">v{pipeline.version}</Badge>
                    {pipeline.lastRunStatus ? (
                      <Badge
                        variant={pipeline.lastRunStatus === 'SUCCEEDED' ? 'success' : 'danger'}
                      >
                        {pipeline.lastRunStatus}
                      </Badge>
                    ) : null}
                    {databaseName ? null : (
                      <span className="truncate font-mono text-caption text-muted-foreground">
                        {pipeline.databaseName ?? pipeline.targetDatabase}
                      </span>
                    )}
                  </ItemTitle>
                </ItemContent>

                {/* Right-aligned facts rather than a second line under the
                 * name: the row is full-page wide, and stranding everything at
                 * the left edge left a screen of dead space beside it. */}
                <span className="hidden shrink-0 text-caption text-muted-foreground sm:inline">
                  {pipeline.status}
                </span>
                <span className="hidden w-32 shrink-0 text-right text-caption text-muted-foreground md:inline">
                  {pipeline.lastRunAt
                    ? t('pipeline.lastRunAt', { when: formatDateTime(pipeline.lastRunAt) })
                    : t('pipeline.neverRun')}
                </span>
                <span className="hidden w-40 shrink-0 text-right text-caption text-muted-foreground lg:inline">
                  {t('pipeline.updatedAt', { when: formatDateTime(pipeline.updatedAt) })}
                </span>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      disabled={isBusy}
                      label={t('pipeline.more', { name: pipeline.name })}
                      size="sm"
                    >
                      <MoreHorizontalIcon />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[180px]">
                    <DropdownMenuItem onSelect={() => openDialog({ kind: 'clone', pipeline })}>
                      <CopyIcon />
                      {t('pipeline.clone')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => openDialog({ kind: 'archive', pipeline })}
                      variant="destructive"
                    >
                      <Trash2Icon />
                      {t('pipeline.archive')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Item>
            ))}
          </div>
        ) : null}

        {/* Pipelines filed under no database at all. They are invisible in every
         * container while their names stay taken workspace-wide, so the
         * container that can adopt one is where the offer belongs. The block
         * disappears the moment there is nothing left unfiled. */}
        {databaseName && unfiled.length > 0 && controllers.get && controllers.save ? (
          <section
            aria-label={t('pipeline.unfiledLabel')}
            className="mt-5 grid gap-2 border-t border-border pt-4"
          >
            <p className="m-0 text-caption text-muted-foreground">
              {unfiled.length === 1
                ? t('pipeline.unfiledOne')
                : t('pipeline.unfiledMany', { count: unfiled.length })}
            </p>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {unfiled.map((pipeline) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
                  key={pipeline.id}
                >
                  <span className="min-w-0 truncate text-caption">{pipeline.name}</span>
                  <Button
                    disabled={filingId !== undefined}
                    onClick={() => void fileHere(pipeline)}
                    size="sm"
                    variant="outline"
                  >
                    {filingId === pipeline.id
                      ? t('pipeline.filing')
                      : t('pipeline.fileHere', { database: databaseName })}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {page && page.totalPages > 1 ? (
          <nav
            className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4"
            aria-label="Pipeline pages"
          >
            <Button
              size="sm"
              variant="outline"
              disabled={page.page <= 1}
              onClick={() => setPageNumber(page.page - 1)}
            >
              Previous
            </Button>
            <span className="text-caption text-muted-foreground">
              Page {page.page} of {page.totalPages} · {page.totalItems} pipelines
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page.page >= page.totalPages}
              onClick={() => setPageNumber(page.page + 1)}
            >
              Next
            </Button>
          </nav>
        ) : null}
      </Card>

      {dialog ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) {
              closeDialog();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {dialog.kind === 'create'
                  ? 'Name the new pipeline'
                  : dialog.kind === 'clone'
                    ? `Clone ${dialog.pipeline.name}`
                    : `Archive ${dialog.pipeline.name}?`}
              </DialogTitle>
            </DialogHeader>
            <p className="mb-5 text-body-sm leading-[1.6] text-muted-foreground">
              {dialog.kind === 'archive'
                ? 'The pipeline is removed from this list. Its saved graph is kept by the platform.'
                : 'Pipeline names are unique across the workspace.'}
            </p>

            {dialog.kind === 'archive' ? null : (
              <div className="grid gap-4">
                {!databaseName && dialog.kind === 'create' ? (
                  <SelectField
                    data={
                      databases?.length
                        ? databases
                        : [{ disabled: true, label: 'No databases available', value: '' }]
                    }
                    disabled={isBusy || !databases?.length}
                    label="Data Catalog database"
                    onChange={setDialogDatabaseName}
                    value={dialogDatabaseName}
                  />
                ) : null}
                <TextField
                  autoComplete="off"
                  disabled={isBusy}
                  label="Pipeline name"
                  maxLength={160}
                  onChange={(event) => setDialogName(event.target.value)}
                  placeholder="Daily order load"
                  value={dialogName}
                />
              </div>
            )}

            {actionError ? <InlineError>{actionError}</InlineError> : null}

            <div className="mt-6 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button variant="outline" disabled={isBusy} onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                variant={dialog.kind === 'archive' ? 'destructive' : 'default'}
                disabled={isBusy || !canSubmitDialog}
                onClick={() => void confirmDialog()}
              >
                {dialog.kind === 'create'
                  ? 'Create'
                  : dialog.kind === 'clone'
                    ? 'Clone'
                    : 'Archive'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
