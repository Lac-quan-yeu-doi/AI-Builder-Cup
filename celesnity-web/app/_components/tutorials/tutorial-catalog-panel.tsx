'use client';

import { XIcon } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Ref,
} from 'react';

import { useTutorialSurfaceFocus } from '@/app/_components/tutorials/use-tutorial-surface-focus';

import { Badge, type BadgeVariant } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/app/_components/ui/card';
import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { Progress } from '@/app/_components/ui/progress';
import { SearchField } from '@/app/_components/ui/search-field';
import type { TranslationKey } from '@/app/_i18n/en';
import { useTranslation } from '@/app/_i18n/use-translation';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import type { ListTutorialCatalogController } from '@/src/interface-adapters/controllers/tutorials/list-tutorial-catalog.controller';
import type {
  CatalogViewModel,
  TutorialCardViewModel,
} from '@/src/interface-adapters/presenters/tutorial-catalog.presenter';
import { clearCatalogViewState, normalizeSearchTerm } from '@/src/entities/models/tutorial-catalog';
import type { TutorialStatus } from '@/src/entities/models/tutorial-progress';
import { getVietnameseAgentTutorial } from '@/src/entities/models/tutorial-agent-localizations';

const STATUS_PRESENTATION = {
  NOT_STARTED: { labelKey: 'tutorial.statusNotStarted', variant: 'outline' },
  IN_PROGRESS: { labelKey: 'tutorial.statusInProgress', variant: 'info' },
  PAUSED: { labelKey: 'tutorial.statusPaused', variant: 'warning' },
  COMPLETED: { labelKey: 'tutorial.statusCompleted', variant: 'success' },
} as const satisfies Readonly<
  Record<TutorialStatus, { readonly labelKey: TranslationKey; readonly variant: BadgeVariant }>
>;

type CatalogLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: CatalogViewModel }
  | { readonly status: 'error' };

export interface TutorialCatalogPanelProps {
  readonly listCatalog: ListTutorialCatalogController;
  readonly onClose: () => void;
  readonly onSelectTutorial: (tutorialId: string) => void;
}

interface TutorialCardProps {
  readonly initialFocusRef?: Ref<HTMLButtonElement>;
  readonly onSelect: (tutorialId: string) => void;
  readonly tutorial: TutorialCardViewModel;
}

function TutorialCard({ initialFocusRef, onSelect, tutorial }: TutorialCardProps) {
  const { locale, t } = useTranslation();
  const localized = locale === 'vi' ? getVietnameseAgentTutorial(tutorial.id)?.metadata : undefined;
  const descriptionId = `${useId()}-description`;
  const status = STATUS_PRESENTATION[tutorial.status];
  const minuteKey =
    tutorial.estimatedMinutes === 1 ? 'tutorial.estimatedMinute' : 'tutorial.estimatedMinutes';
  const stepKey = tutorial.stepCount === 1 ? 'tutorial.stepCountSingular' : 'tutorial.stepCount';

  return (
    <Card asChild className="gap-4 py-5 shadow-hairline">
      <li>
        <CardHeader className="gap-3 px-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{localized?.category ?? tutorial.category}</Badge>
            <Badge variant={status.variant}>{t(status.labelKey)}</Badge>
          </div>
          <h3 className="text-title text-foreground">{localized?.title ?? tutorial.title}</h3>
          <p id={descriptionId} className="text-body-sm text-muted-foreground">
            {localized?.summary ?? tutorial.summary}
          </p>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 px-5">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
            <span>{t(minuteKey, { count: tutorial.estimatedMinutes })}</span>
            <span>{t(stepKey, { count: tutorial.stepCount })}</span>
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-label text-foreground">{t('tutorial.learningOutcomes')}</h4>
            <ul className="list-disc space-y-1 pl-5 text-body-sm text-muted-foreground">
              {(localized?.learningOutcomes ?? tutorial.learningOutcomes).map((outcome) => (
                <li key={outcome}>{outcome}</li>
              ))}
            </ul>
          </div>

          {tutorial.progressPercentage === undefined ? null : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4 text-caption">
                <span className="text-foreground">{t('tutorial.progress')}</span>
                <span className="text-muted-foreground">
                  {t('tutorial.progressPercent', { percent: tutorial.progressPercentage })}
                </span>
              </div>
              <Progress
                aria-label={t('tutorial.progressPercent', {
                  percent: tutorial.progressPercentage,
                })}
                value={tutorial.progressPercentage}
              />
            </div>
          )}
        </CardContent>

        <CardFooter className="px-5">
          <Button
            aria-describedby={descriptionId}
            className="w-full"
            onClick={() => onSelect(tutorial.id)}
            ref={initialFocusRef}
          >
            {t('tutorial.viewDetails')}
          </Button>
        </CardFooter>
      </li>
    </Card>
  );
}

/**
 * Catalog screen backed by the list controller. Server-owned cards stay local;
 * only the cross-surface search and scroll position live in Zustand.
 */
export function TutorialCatalogPanel({
  listCatalog,
  onClose,
  onSelectTutorial,
}: TutorialCatalogPanelProps) {
  const { t } = useTranslation();
  const catalogView = useTutorialSessionStore((state) => state.catalogView);
  const setCatalogView = useTutorialSessionStore((state) => state.setCatalogView);
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstTutorialRef = useRef<HTMLButtonElement>(null);
  const [loadState, setLoadState] = useState<CatalogLoadState>({ status: 'loading' });
  const hasAvailableTutorial = loadState.status === 'ready' && loadState.value.tutorials.length > 0;
  useTutorialSurfaceFocus(
    hasAvailableTutorial ? firstTutorialRef : headingRef,
    loadState.status === 'ready',
  );

  useEffect(() => {
    let current = true;

    void listCatalog({
      searchTerm: catalogView.search,
      statusFilters: [],
    }).then(
      (value) => {
        if (current) setLoadState({ status: 'ready', value });
      },
      () => {
        if (current) setLoadState({ status: 'error' });
      },
    );

    return () => {
      current = false;
    };
  }, [catalogView.search, listCatalog]);

  useLayoutEffect(() => {
    if (loadState.status === 'ready' && listRef.current !== null) {
      listRef.current.scrollTop = catalogView.scrollTop;
    }
  }, [catalogView.scrollTop, loadState.status]);

  const moveListToStart = () => {
    if (listRef.current !== null) listRef.current.scrollTop = 0;
  };

  const updateSearch = (event: ChangeEvent<HTMLInputElement>) => {
    moveListToStart();
    setCatalogView({
      search: event.currentTarget.value,
      filters: [],
      scrollTop: 0,
    });
  };

  const clearSearch = () => {
    moveListToStart();
    setCatalogView({ ...catalogView, search: '', filters: [], scrollTop: 0 });
  };

  const clearAll = () => {
    moveListToStart();
    setCatalogView(clearCatalogViewState(catalogView));
  };

  const selectTutorial = (tutorialId: string) => {
    setCatalogView({
      ...catalogView,
      filters: [],
      scrollTop: listRef.current?.scrollTop ?? catalogView.scrollTop,
    });
    onSelectTutorial(tutorialId);
  };

  const hasActiveQuery = normalizeSearchTerm(catalogView.search).length > 0;
  const resultCount = loadState.status === 'ready' ? loadState.value.tutorials.length : 0;

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="tutorial-catalog-title">
      <header className="flex flex-col gap-5 border-b border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2
              id="tutorial-catalog-title"
              ref={headingRef}
              className="text-heading-2 text-foreground"
              tabIndex={-1}
            >
              {t('tutorial.catalogTitle')}
            </h2>
            <p className="text-body-sm text-muted-foreground">{t('tutorial.catalogDescription')}</p>
          </div>
          <Button
            aria-label={t('tutorial.closeCatalog')}
            onClick={onClose}
            size="icon-sm"
            variant="ghost"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>

        <SearchField
          clearLabel={t('tutorial.clearSearch')}
          label={t('tutorial.searchLabel')}
          onChange={updateSearch}
          onClear={clearSearch}
          placeholder={t('tutorial.searchPlaceholder')}
          value={catalogView.search}
        />
      </header>

      <div
        aria-label={t('tutorial.resultsCount', { count: resultCount })}
        className="min-h-0 flex-1 overflow-y-auto p-5"
        ref={listRef}
        role="region"
        tabIndex={0}
      >
        {loadState.status === 'loading' ? (
          <p className="text-body-sm text-muted-foreground" role="status">
            {t('tutorial.catalogLoading')}
          </p>
        ) : null}

        {loadState.status === 'error' ? (
          <PageAlert>{t('tutorial.catalogLoadError')}</PageAlert>
        ) : null}

        {loadState.status === 'ready' ? (
          <div className="flex flex-col gap-4">
            <p className="text-caption text-muted-foreground" role="status">
              {t('tutorial.resultsCount', { count: resultCount })}
            </p>

            {loadState.value.noResults ? (
              hasActiveQuery ? (
                <EmptyBlock
                  action={<Button onClick={clearAll}>{t('tutorial.clearSearch')}</Button>}
                  description={t('tutorial.noResultsDescription')}
                  title={t('tutorial.noResultsTitle')}
                />
              ) : (
                <EmptyBlock
                  description={t('tutorial.noTutorialsDescription')}
                  title={t('tutorial.noTutorialsTitle')}
                />
              )
            ) : (
              <ul className="flex flex-col gap-4">
                {loadState.value.tutorials.map((tutorial, index) => (
                  <TutorialCard
                    initialFocusRef={index === 0 ? firstTutorialRef : undefined}
                    key={tutorial.id}
                    onSelect={selectTutorial}
                    tutorial={tutorial}
                  />
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
