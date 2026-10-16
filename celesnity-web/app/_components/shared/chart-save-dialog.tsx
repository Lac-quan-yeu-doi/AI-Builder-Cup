'use client';

import { SaveIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import { Textarea } from '@/app/_components/ui/textarea';
import type { ChartCollection } from '@/src/entities/models/chart-collection';
import { ChartCollectionPicker } from './chart-collection-picker';
import { flattenCollectionOptions } from './chart-collection-options';

export interface ChartSaveValues {
  readonly title: string;
  readonly collectionId: string;
  readonly description: string | null;
}

export interface ChartSaveDialogProps {
  readonly open: boolean;
  readonly mode?: 'CREATE' | 'SAVE_AS_NEW';
  readonly values: ChartSaveValues;
  readonly collections: readonly ChartCollection[];
  readonly collectionsLoading?: boolean;
  readonly error?: string | null;
  readonly submitting?: boolean;
  readonly onChange: (values: ChartSaveValues) => void;
  readonly onSubmit: (values: ChartSaveValues) => void;
  readonly onClose: () => void;
}

/** Metadata-only save dialog. Preview rows and renderer output are intentionally not accepted. */
export function ChartSaveDialog({
  open,
  mode = 'CREATE',
  values,
  collections,
  collectionsLoading = false,
  error = null,
  submitting = false,
  onChange,
  onSubmit,
  onClose,
}: ChartSaveDialogProps) {
  if (!open) return null;

  const update = (patch: Partial<ChartSaveValues>): void => onChange({ ...values, ...patch });
  const heading = mode === 'SAVE_AS_NEW' ? 'Save chart as new' : 'Save chart';
  const validDestination = flattenCollectionOptions(collections).some(
    ({ collection }) => collection.id === values.collectionId,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
    >
      <section
        className="w-full max-w-lg space-y-5 rounded-xl border border-border bg-background p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
      >
        <header className="space-y-1">
          <h2 className="text-lg font-semibold">{heading}</h2>
          <p className="text-sm text-muted-foreground">
            Choose where to save this chart. Query results remain transient and are not persisted.
          </p>
        </header>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(values);
          }}
        >
          <label className="grid gap-2 text-sm font-medium">
            Chart title
            <Input
              aria-label="Chart title"
              value={values.title}
              onChange={(event) => update({ title: event.target.value })}
              autoFocus
            />
          </label>
          <div className="grid gap-2 text-sm font-medium">
            Destination collection
            <ChartCollectionPicker
              collections={collections}
              value={values.collectionId}
              loading={collectionsLoading}
              disabled={submitting}
              onChange={(collectionId) => update({ collectionId })}
            />
            <span className="text-xs font-normal text-muted-foreground">
              You need Curate access to save into this collection.
            </span>
          </div>
          <label className="grid gap-2 text-sm font-medium">
            Description
            <Textarea
              aria-label="Description"
              className="min-h-24"
              placeholder="Optional description"
              value={values.description ?? ''}
              onChange={(event) => update({ description: event.target.value || null })}
            />
          </label>
          {error ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                submitting || collectionsLoading || !values.title.trim() || !validDestination
              }
            >
              <SaveIcon aria-hidden="true" /> {submitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
