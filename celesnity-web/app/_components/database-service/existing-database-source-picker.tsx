'use client';

import type { DatabaseServiceViewModel } from '@/src/interface-adapters/presenters/database-service.presenter';
import { Button } from '@/app/_components/ui/button';
import { TextField } from '@/app/_components/ui/fields';
import { InlineError } from '@/app/_components/ui/page-alert';
import { Spinner } from '@/app/_components/ui/spinner';
import { useTranslation } from '@/app/_i18n/use-translation';

interface ExistingDatabaseSourcePickerProps {
  readonly services: readonly DatabaseServiceViewModel[];
  readonly loading: boolean;
  readonly error?: string;
  readonly search: string;
  readonly addingId?: string;
  readonly onSearch: (value: string) => void;
  readonly onAdd: (service: DatabaseServiceViewModel) => void;
}

export function ExistingDatabaseSourcePicker({
  services,
  loading,
  error,
  search,
  addingId,
  onSearch,
  onAdd,
}: ExistingDatabaseSourcePickerProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4">
      <TextField
        label={t('databaseServices.searchSources')}
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder={t('databaseServices.searchSourcesPlaceholder')}
      />
      {error ? <InlineError>{error}</InlineError> : null}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-body-sm text-muted-foreground">
          <Spinner className="size-5" />
          {t('databaseServices.loadingAvailable')}
        </div>
      ) : services.length === 0 ? (
        <p className="py-8 text-center text-body-sm text-muted-foreground">
          {t('databaseServices.noAvailableSources')}
        </p>
      ) : (
        <div className="grid gap-2" role="list" aria-label={t('databaseServices.availableSources')}>
          {services.map((service) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
              key={service.id}
              role="listitem"
            >
              <div className="min-w-0">
                <p className="truncate text-body-sm font-medium">{service.name}</p>
                <p className="truncate text-caption text-muted-foreground">
                  {service.connectorType}
                  {(service.databaseNames ?? []).length > 0
                    ? ` · ${t('databaseServices.sharedWith', { count: (service.databaseNames ?? []).length })}`
                    : ''}
                </p>
              </div>
              <Button
                disabled={addingId !== undefined}
                onClick={() => onAdd(service)}
                size="sm"
                type="button"
              >
                {addingId === service.id
                  ? t('databaseServices.adding')
                  : t('databaseServices.addSource')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
