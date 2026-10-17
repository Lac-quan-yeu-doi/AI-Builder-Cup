'use client';

import { useState } from 'react';
import { LightbulbIcon } from 'lucide-react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Textarea } from '@/app/_components/ui/textarea';
import {
  deviationSuggestions,
  runSeconds,
  transferMetrics,
  type RepairGuide,
} from '@/src/entities/models/repair-guide';
import type { RepairGuideController } from '@/src/interface-adapters/controllers/plant-model/repair-guide.controller';

import { formatDuration, formatPercent } from './repair-format';

export function GuideTransferTab({
  guide,
  controller,
  onChange,
}: {
  readonly guide: RepairGuide;
  readonly controller: RepairGuideController;
  readonly onChange: (guide: RepairGuide) => void;
}) {
  const { t } = useTranslation();
  const metrics = transferMetrics(guide);
  const suggestions = deviationSuggestions(guide);
  const [editing, setEditing] = useState<{ readonly step: number; readonly text: string }>();
  const [error, setError] = useState('');

  async function revise() {
    if (editing === undefined) return;
    try {
      onChange(
        await controller.reviseStep(
          guide.id,
          editing.step,
          editing.text,
          t('plantRepairs.revisedFromRuns', { step: editing.step + 1 }),
        ),
      );
      setEditing(undefined);
    } catch {
      setError(t('plantRepairs.saveError'));
    }
  }

  const tiles: readonly [string, string, string][] = [
    [t('plantRepairs.metric.expert'), formatDuration(metrics.expertSeconds), guide.expert],
    [
      t('plantRepairs.metric.runs'),
      String(metrics.runs),
      t('plantRepairs.metric.fixedCount', { count: metrics.fixed }),
    ],
    [t('plantRepairs.metric.firstTimeFix'), formatPercent(metrics.firstTimeFixRate), ''],
    [
      t('plantRepairs.metric.median'),
      metrics.medianSeconds === undefined ? '—' : formatDuration(metrics.medianSeconds),
      metrics.ratio === undefined
        ? ''
        : t('plantRepairs.metric.ratio', { ratio: metrics.ratio.toFixed(1) }),
    ],
  ];

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-3xl text-body-md text-muted-foreground">
        {t('plantRepairs.transferIntro')}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value, note]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <dt className="text-body-sm text-muted-foreground">{label}</dt>
            <dd className="text-heading-2 tabular-nums">{value}</dd>
            {note ? <dd className="text-micro text-muted-foreground">{note}</dd> : null}
          </div>
        ))}
      </dl>

      {suggestions.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-title">
            <LightbulbIcon className="size-4.5 text-status-warning" aria-hidden />
            {t('plantRepairs.suggestionsTitle')}
          </h3>
          <p className="max-w-3xl text-body-sm text-muted-foreground">
            {t('plantRepairs.suggestionsBody')}
          </p>
          {suggestions.map((suggestion) => {
            const step = guide.procedure.steps[suggestion.step];
            if (step === undefined) return null;
            const open = editing?.step === suggestion.step;
            return (
              <article key={suggestion.step} className="rounded-xl border bg-card p-4">
                <p className="text-label">
                  {suggestion.step + 1}. {step.title}
                </p>
                <p className="mt-1 text-body-sm text-muted-foreground">{step.instruction}</p>
                <ul className="mt-3 space-y-1 text-body-sm">
                  {suggestion.deviations.map((deviation, index) => (
                    <li key={`${deviation.worker}-${index}`}>
                      <span className="text-label">{deviation.worker}: </span>
                      {deviation.text}
                    </li>
                  ))}
                </ul>
                {open ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <Textarea
                      aria-label={t('plantRepairs.newInstruction')}
                      rows={3}
                      value={editing.text}
                      onChange={(event) =>
                        setEditing({ step: suggestion.step, text: event.target.value })
                      }
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void revise()}>
                        {t('plantRepairs.saveRevision')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(undefined)}>
                        {t('plantRepairs.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing({ step: suggestion.step, text: step.instruction })}
                  >
                    {t('plantRepairs.updateStep')}
                  </Button>
                )}
              </article>
            );
          })}
        </section>
      ) : null}
      {error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h3 className="text-title">{t('plantRepairs.runsTitle')}</h3>
        {guide.runs.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{t('plantRepairs.noRuns')}</p>
        ) : (
          <table className="w-full max-w-4xl text-body-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">{t('plantRepairs.run.worker')}</th>
                <th className="py-2 font-medium">{t('plantRepairs.run.when')}</th>
                <th className="py-2 font-medium">{t('plantRepairs.run.time')}</th>
                <th className="py-2 font-medium">{t('plantRepairs.run.deviations')}</th>
                <th className="py-2 font-medium">{t('plantRepairs.run.outcome')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...guide.runs].reverse().map((run) => (
                <tr key={run.id}>
                  <td className="py-2">{run.worker}</td>
                  <td className="py-2 text-muted-foreground tabular-nums">
                    {new Date(run.finishedAt).toLocaleString()}
                  </td>
                  <td className="py-2 tabular-nums">{formatDuration(runSeconds(run))}</td>
                  <td className="py-2 tabular-nums">
                    {run.steps.filter((step) => step.deviation.trim() !== '').length}
                  </td>
                  <td className="py-2">
                    <Badge variant={run.outcome === 'fixed' ? 'success' : 'danger'}>
                      {run.outcome === 'fixed'
                        ? t('plantRepairs.outcome.fixed')
                        : t('plantRepairs.outcome.notFixed')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
