'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/app/_components/ui/button';
import { Combobox } from '@/app/_components/ui/combobox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_components/ui/dialog';
import { TextField } from '@/app/_components/ui/fields';
import { InlineError } from '@/app/_components/ui/page-alert';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { MetadataCrawler } from '@/src/entities/models/metadata-crawler';
import type { MetadataCrawlerController } from '@/src/interface-adapters/controllers/metadata-crawler/metadata-crawler.controller';

import {
  metadataCrawlerDefaultTimezone,
  metadataCrawlerTimezoneOptions,
} from './metadata-crawler-timezones';

const timezoneOptions = metadataCrawlerTimezoneOptions();

interface ScanScheduleDialogProps {
  readonly controller: MetadataCrawlerController;
  /**
   * The scan being changed. Absent means none is assigned yet, which is the
   * only difference between the two cases: the fields are the same three.
   */
  readonly crawler?: MetadataCrawler;
  readonly databaseServiceId: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
  readonly open: boolean;
}

/**
 * The schedule of one source's metadata scan, set from the source's own screen.
 *
 * Assigning and editing ask for the same three fields — name, time, timezone —
 * against a source that is already known, so they are one form. The crawler
 * list keeps its own copy because it also has to ask which source is meant.
 *
 * A second form here would be a second place for the cadence rules to drift:
 * the time field only exists because the cadence is `DAILY`, and a `CUSTOM`
 * expression is not editable from the product at all.
 */
export function ScanScheduleDialog({
  controller,
  crawler,
  databaseServiceId,
  onOpenChange,
  onSaved,
  open,
}: ScanScheduleDialogProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const editing = crawler !== undefined;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const schedule = {
      cadence: 'DAILY' as const,
      timeOfDay: String(form.get('timeOfDay') ?? '01:00').trim(),
      timezone: String(form.get('timezone') ?? metadataCrawlerDefaultTimezone()).trim(),
    };
    // Left to Core to name when blank: the crawler list does the same, and one
    // source has one scan, so a name is a label rather than a key.
    const name = String(form.get('name') ?? '').trim() || undefined;

    setBusy(true);
    setError(undefined);
    try {
      if (crawler) {
        await controller.update(crawler.id, { ...(name ? { name } : {}), schedule });
      } else {
        await controller.assign({
          databaseServiceId,
          ...(name ? { name } : {}),
          schedule,
        });
      }
      onOpenChange(false);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) setError(undefined);
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? t('source.scan.editSchedule') : t('source.scan.assign')}
          </DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <TextField
            defaultValue={crawler?.name}
            label={t('metadataCrawler.name')}
            name="name"
            placeholder={t('metadataCrawler.namePlaceholder')}
          />
          <TextField
            defaultValue={
              crawler?.schedule.cadence === 'DAILY' ? crawler.schedule.timeOfDay : '01:00'
            }
            label={t('metadataCrawler.time')}
            name="timeOfDay"
            type="time"
          />
          <Combobox
            data={timezoneOptions}
            defaultValue={crawler?.schedule.timezone ?? metadataCrawlerDefaultTimezone()}
            label={t('metadataCrawler.timezone')}
            name="timezone"
            placeholder={t('metadataCrawler.timezonePlaceholder')}
          />
          {error ? <InlineError>{error}</InlineError> : null}
          <div className="flex justify-end gap-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              {t('metadataCrawler.cancel')}
            </Button>
            <Button data-tutorial-target="save-metadata-crawler" disabled={busy} type="submit">
              {editing ? t('action.save') : t('metadataCrawler.saveAssignment')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
