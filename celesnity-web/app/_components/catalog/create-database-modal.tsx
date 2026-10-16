'use client';

import type { FormEvent } from 'react';

import { Button } from '@/app/_components/ui/button';
import { InlineError } from '@/app/_components/ui/page-alert';
import { Spinner } from '@/app/_components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_components/ui/dialog';
import { TextareaField, TextField } from '@/app/_components/ui/fields';
import { useTranslation } from '@/app/_i18n/use-translation';

interface CreateDatabaseModalProps {
  readonly name: string;
  readonly description: string;
  readonly error?: string;
  readonly isSubmitting: boolean;
  readonly onNameChange: (name: string) => void;
  readonly onDescriptionChange: (description: string) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}

export function CreateDatabaseModal({
  name,
  description,
  error,
  isSubmitting,
  onNameChange,
  onDescriptionChange,
  onCancel,
  onSubmit,
}: CreateDatabaseModalProps) {
  const { t } = useTranslation();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('catalog.createDatabaseTitle')}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div>
            <p className="mt-2 text-body-sm leading-[1.55] text-muted-foreground">
              {t('catalog.createDatabaseDescription')}
            </p>
          </div>

          <TextField
            autoFocus
            autoComplete="off"
            disabled={isSubmitting}
            label={t('catalog.databaseNameLabel')}
            hint={t('catalog.databaseNameHint')}
            maxLength={255}
            pattern="[A-Za-z0-9_]+"
            placeholder={t('catalog.databaseNamePlaceholder')}
            required
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
          />

          <TextareaField
            disabled={isSubmitting}
            label={t('catalog.databaseDescriptionLabel')}
            hint={t('catalog.databaseDescriptionHint')}
            maxLength={1000}
            placeholder={t('catalog.databaseDescriptionPlaceholder')}
            rows={3}
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
          />

          {/* `InlineError` is already the `alert` landmark; a wrapper here
              would announce the failure twice. */}
          {error ? <InlineError>{error}</InlineError> : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={isSubmitting} onClick={onCancel}>
              {t('action.cancel')}
            </Button>
            <Button
              data-tutorial-target="submit-create-database"
              disabled={isSubmitting || name.trim().length === 0}
              type="submit"
            >
              {isSubmitting ? <Spinner /> : null}
              {t('catalog.createDatabase')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
