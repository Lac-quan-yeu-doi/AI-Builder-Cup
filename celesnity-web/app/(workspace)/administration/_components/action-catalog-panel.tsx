'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@/app/_components/ui/badge';
import { DataTable, type DataTableColumn } from '@/app/_components/ui/data-table';
import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { Spinner } from '@/app/_components/ui/spinner';
import { Card } from '@/app/_components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import type { TranslationKey } from '@/app/_i18n/en';
import type { Translator } from '@/app/_i18n/translate';
import { useTranslation } from '@/app/_i18n/use-translation';
import {
  ACTION_CATALOG_DOMAINS,
  type ActionCatalogDomain,
} from '@/src/entities/models/action-catalog';
import type { ListActionCatalogController } from '@/src/interface-adapters/controllers/action-catalog/list-action-catalog.controller';
import type { ActionCatalogEntryViewModel } from '@/src/interface-adapters/presenters/action-catalog.presenter';

interface ActionCatalogPanelProps {
  readonly listActionCatalog: ListActionCatalogController;
}

const DOMAIN_TAB_LABEL_KEYS: Readonly<Record<ActionCatalogDomain, TranslationKey>> = {
  chart: 'administration.actionCatalog.tab.chart',
  document: 'administration.actionCatalog.tab.document',
};

type LoadState =
  | { readonly status: 'loaded'; readonly entries: readonly ActionCatalogEntryViewModel[] }
  | { readonly status: 'error' };

/**
 * Read-only visibility into what an agent is registered to call — AIP
 * Chatbot Studio's "Tools" menu / AIP Analyst's "Manage tools" equivalent.
 * No enable/disable toggle: `approvalRequired` is hardcoded per
 * `ActionDefinition`, not a runtime config store, so a toggle here would be
 * a UI that lies.
 */
export function ActionCatalogPanel({ listActionCatalog }: ActionCatalogPanelProps) {
  const { t } = useTranslation();
  const [domain, setDomain] = useState<ActionCatalogDomain>('chart');
  const [statesByDomain, setStatesByDomain] = useState<
    Partial<Record<ActionCatalogDomain, LoadState>>
  >({});

  useEffect(() => {
    if (statesByDomain[domain] !== undefined) return;
    let cancelled = false;
    listActionCatalog(domain)
      .then((entries) => {
        if (cancelled) return;
        setStatesByDomain((previous) => ({ ...previous, [domain]: { status: 'loaded', entries } }));
      })
      .catch(() => {
        if (cancelled) return;
        setStatesByDomain((previous) => ({ ...previous, [domain]: { status: 'error' } }));
      });
    return () => {
      cancelled = true;
    };
  }, [domain, listActionCatalog, statesByDomain]);

  const columns: readonly DataTableColumn<ActionCatalogEntryViewModel>[] = [
    {
      key: 'tool',
      header: t('administration.actionCatalog.column.tool'),
      mono: true,
      render: (row) => row.toolName,
    },
    {
      key: 'action',
      header: t('administration.actionCatalog.column.action'),
      mono: true,
      render: (row) => row.actionName,
    },
    {
      key: 'permission',
      header: t('administration.actionCatalog.column.permission'),
      render: (row) => (
        <Badge variant={row.permission === 'write' ? 'default' : 'secondary'}>
          {row.permission}
        </Badge>
      ),
    },
    {
      key: 'approval',
      header: t('administration.actionCatalog.column.approval'),
      render: (row) => (
        <Badge variant={row.approvalRequired ? 'warning' : 'secondary'}>
          {row.approvalRequired
            ? t('administration.actionCatalog.approvalRequired')
            : t('administration.actionCatalog.approvalNotRequired')}
        </Badge>
      ),
    },
    {
      key: 'audited',
      header: t('administration.actionCatalog.column.audited'),
      render: (row) => (
        <Badge variant={row.auditRequired ? 'success' : 'secondary'}>
          {row.auditRequired
            ? t('administration.actionCatalog.audited')
            : t('administration.actionCatalog.notAudited')}
        </Badge>
      ),
    },
    {
      key: 'description',
      header: t('administration.actionCatalog.column.description'),
      render: (row) => row.description,
    },
  ];

  return (
    <Card className="flex flex-col gap-4 p-6" asChild>
      <section>
        <div>
          <h2 className="m-0 text-lg font-semibold text-foreground">
            {t('administration.actionCatalog.title')}
          </h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            {t('administration.actionCatalog.description')}
          </p>
        </div>

        <Tabs onValueChange={(value) => setDomain(value as ActionCatalogDomain)} value={domain}>
          <TabsList aria-label={t('administration.actionCatalog.title')}>
            {ACTION_CATALOG_DOMAINS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(DOMAIN_TAB_LABEL_KEYS[value])}
              </TabsTrigger>
            ))}
          </TabsList>
          {ACTION_CATALOG_DOMAINS.map((value) => (
            <TabsContent key={value} value={value}>
              <ActionCatalogTabContent columns={columns} state={statesByDomain[value]} t={t} />
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </Card>
  );
}

function ActionCatalogTabContent({
  state,
  columns,
  t,
}: {
  readonly state: LoadState | undefined;
  readonly columns: readonly DataTableColumn<ActionCatalogEntryViewModel>[];
  readonly t: Translator;
}) {
  if (state === undefined) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Spinner className="size-5" />
        {t('administration.actionCatalog.loading')}
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="py-6 text-sm text-destructive">
        {t('administration.actionCatalog.error')}
      </p>
    );
  }
  return (
    <DataTable
      ariaLabel={t('administration.actionCatalog.title')}
      columns={columns}
      rows={state.entries}
      rowKey={(row) => row.actionName}
      emptyMessage={<EmptyBlock title={t('administration.actionCatalog.empty')} />}
    />
  );
}
