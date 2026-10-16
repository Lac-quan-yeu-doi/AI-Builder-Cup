'use client';

import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { Card } from '@/app/_components/ui/card';
import { Spinner } from '@/app/_components/ui/spinner';
import { useTranslation } from '@/app/_i18n/use-translation';
import type {
  SourceColumn,
  SourceConstraint,
  SourceRelation,
} from '@/src/entities/models/source-metadata';
import type {
  SourceColumnSort,
  SourceMetadataSortDirection,
} from '@/src/entities/models/source-metadata';
import { SourceMetadataListPanel } from './source-metadata-list-panel';

interface Props {
  readonly relation: SourceRelation | undefined;
  /** The schema it belongs to. The relation itself only carries the id. */
  readonly namespaceName?: string;
  readonly columns: readonly SourceColumn[] | undefined;
  readonly constraints: readonly SourceConstraint[] | undefined;
  readonly columnSearch: string;
  readonly columnSortBy: SourceColumnSort;
  readonly columnSortDirection: SourceMetadataSortDirection;
  readonly columnPage: number;
  readonly columnTotalPages: number;
  readonly onColumnSearchChange: (value: string) => void;
  readonly onColumnSortChange: (value: string) => void;
  readonly onColumnDirectionChange: (value: SourceMetadataSortDirection) => void;
  readonly onColumnPageChange: (page: number) => void;
}

export function SourceRelationDetail({
  relation,
  namespaceName,
  columns,
  constraints,
  columnSearch,
  columnSortBy,
  columnSortDirection,
  columnPage,
  columnTotalPages,
  onColumnSearchChange,
  onColumnSortChange,
  onColumnDirectionChange,
  onColumnPageChange,
}: Props) {
  const { t } = useTranslation();
  if (!relation) {
    return <EmptyBlock title={t('metadataExplorer.selectRelation')} />;
  }
  return (
    <div className="grid gap-4">
      <Card className="grid gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-body-md font-[650] tracking-[-0.01em]">
              {namespaceName ? (
                <span className="font-normal text-muted-foreground">{namespaceName}.</span>
              ) : null}
              {relation.name}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {relation.relationType} · {relation.columnCount}{' '}
              {t('metadataExplorer.columns').toLocaleLowerCase()}
            </p>
          </div>
        </div>
        {relation.description ? (
          <section>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('metadataExplorer.description')}
            </h3>
            <p className="m-0 text-sm">{relation.description}</p>
          </section>
        ) : null}
        {relation.ddl ? (
          <section>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('metadataExplorer.ddl')}
            </h3>
            <pre className="m-0 overflow-auto rounded-lg bg-muted p-3 text-xs">{relation.ddl}</pre>
          </section>
        ) : null}
        {/* Most relations carry none, and a heading over a literal `{}` reads
         * as a section that failed to load rather than as an absence. */}
        {Object.keys(relation.properties ?? {}).length > 0 ? (
          <section>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('metadataExplorer.properties')}
            </h3>
            <pre className="m-0 overflow-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify(relation.properties, null, 2)}
            </pre>
          </section>
        ) : null}
      </Card>
      <SourceMetadataListPanel
        title={t('metadataExplorer.columns')}
        search={columnSearch}
        onSearchChange={onColumnSearchChange}
        sortBy={columnSortBy}
        sortOptions={[
          { value: 'ordinalPosition', label: t('metadataExplorer.ordinalPosition') },
          { value: 'name', label: t('metadataExplorer.name') },
          { value: 'nativeType', label: t('metadataExplorer.nativeType') },
          { value: 'nullable', label: t('metadataExplorer.nullable') },
        ]}
        onSortChange={onColumnSortChange}
        sortDirection={columnSortDirection}
        onDirectionChange={onColumnDirectionChange}
        rows={columns}
        columns={[
          {
            key: 'ordinalPosition',
            header: t('metadataExplorer.ordinalPosition'),
            render: (column) => column.ordinalPosition,
          },
          {
            key: 'name',
            header: t('metadataExplorer.name'),
            mono: true,
            render: (column) => column.name,
          },
          {
            key: 'nativeType',
            header: t('metadataExplorer.nativeType'),
            mono: true,
            render: (column) => column.nativeType,
          },
          {
            key: 'nullable',
            header: t('metadataExplorer.nullable'),
            render: (column) => String(column.nullable),
          },
          {
            key: 'description',
            header: t('metadataExplorer.description'),
            render: (column) => column.description ?? '—',
          },
        ]}
        rowKey={(column) => column.id}
        emptyMessage={t('metadataExplorer.emptyColumns')}
        page={columnPage}
        totalPages={columnTotalPages}
        onPageChange={onColumnPageChange}
      />
      <Card className="grid gap-3 p-4">
        <h2 className="m-0 text-base font-semibold">{t('metadataExplorer.constraints')}</h2>
        {constraints === undefined ? (
          <div className="grid min-h-24 place-items-center">
            <Spinner className="size-7 text-primary" />
          </div>
        ) : constraints.length === 0 ? (
          <EmptyBlock title={t('metadataExplorer.noConstraints')} />
        ) : (
          <div className="grid gap-3">
            {constraints.map((constraint) => (
              <article className="rounded-lg border border-border p-3" key={constraint.id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="m-0 text-sm font-semibold">{constraint.name}</h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    {constraint.constraintType}
                  </span>
                </div>
                <p className="mt-2 mb-0 text-sm">
                  {constraint.columns.map((column) => column.name).join(', ')}
                </p>
                {constraint.referencedRelationPath ? (
                  <p className="mt-1 mb-0 text-xs text-muted-foreground">
                    {constraint.referencedRelationPath}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
