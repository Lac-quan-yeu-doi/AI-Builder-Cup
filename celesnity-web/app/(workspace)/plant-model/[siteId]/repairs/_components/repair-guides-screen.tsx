'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MicIcon, PlayIcon, VideoIcon, WrenchIcon } from 'lucide-react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { PageBar } from '@/app/_components/ui/page-bar';
import { transferMetrics, type RepairGuide } from '@/src/entities/models/repair-guide';
import type { RepairGuideController } from '@/src/interface-adapters/controllers/plant-model/repair-guide.controller';

import { usePlantWorkspace } from '../../_components/plant-workspace-context';
import { formatDuration, formatPercent } from './repair-format';

export function RepairGuidesScreen({
  controller,
  siteId,
}: {
  readonly controller: RepairGuideController;
  readonly siteId: string;
}) {
  const { t } = useTranslation();
  const { site } = usePlantWorkspace();
  const [guides, setGuides] = useState<readonly RepairGuide[]>();
  const [error, setError] = useState('');
  const base = `/plant-model/${encodeURIComponent(siteId)}/repairs`;

  useEffect(() => {
    let active = true;
    void controller.list(siteId).then(
      (value) => {
        if (active) setGuides(value);
      },
      () => {
        if (active) setError(t('plantRepairs.loadError'));
      },
    );
    return () => {
      active = false;
    };
  }, [controller, siteId, t]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6">
      <PageBar
        eyebrow={
          <>
            {t('plantRail.group.operations')} · {site?.name ?? ''}
          </>
        }
        title={t('plantRepairs.title')}
        description={t('plantRepairs.subtitle')}
        actions={
          <Button asChild>
            <Link href={`${base}/capture`}>
              <VideoIcon />
              {t('plantRepairs.capture')}
            </Link>
          </Button>
        }
      />

      <ol className="grid gap-3 md:grid-cols-5">
        {(
          [
            ['plantRepairs.loop.capture', 'plantRepairs.loop.captureBody'],
            ['plantRepairs.loop.distil', 'plantRepairs.loop.distilBody'],
            ['plantRepairs.loop.review', 'plantRepairs.loop.reviewBody'],
            ['plantRepairs.loop.guide', 'plantRepairs.loop.guideBody'],
            ['plantRepairs.loop.learn', 'plantRepairs.loop.learnBody'],
          ] as const
        ).map(([title, body], index) => (
          <li key={title} className="rounded-lg border bg-card p-4">
            <p className="text-micro text-muted-foreground tabular-nums">{index + 1}</p>
            <p className="text-label">{t(title)}</p>
            <p className="mt-1 text-body-sm text-muted-foreground">{t(body)}</p>
          </li>
        ))}
      </ol>

      {error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}

      {guides !== undefined && guides.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <MicIcon className="size-6 text-muted-foreground" aria-hidden />
          <h2 className="text-title">{t('plantRepairs.emptyTitle')}</h2>
          <p className="max-w-xl text-body-sm text-muted-foreground">
            {t('plantRepairs.emptyBody')}
          </p>
          <Button asChild variant="outline">
            <Link href={`${base}/capture`}>{t('plantRepairs.capture')}</Link>
          </Button>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        {(guides ?? []).map((guide) => {
          const metrics = transferMetrics(guide);
          return (
            <article key={guide.id} className="flex flex-col gap-4 rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <Link
                    href={`${base}/${encodeURIComponent(guide.id)}`}
                    className="text-title hover:underline"
                  >
                    {guide.procedure.title}
                  </Link>
                  <p className="text-body-sm text-muted-foreground">
                    {t('plantRepairs.machineFault', {
                      machine: guide.machineName,
                      fault: guide.faultName,
                    })}
                  </p>
                </div>
                <Badge variant={guide.status === 'approved' ? 'success' : 'warning'}>
                  {guide.status === 'approved'
                    ? t('plantRepairs.status.approved', { revision: guide.revision })
                    : t('plantRepairs.status.draft', { revision: guide.revision })}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-body-sm sm:grid-cols-4">
                <Metric
                  label={t('plantRepairs.metric.expert')}
                  value={formatDuration(metrics.expertSeconds)}
                />
                <Metric label={t('plantRepairs.metric.runs')} value={String(metrics.runs)} />
                <Metric
                  label={t('plantRepairs.metric.firstTimeFix')}
                  value={formatPercent(metrics.firstTimeFixRate)}
                />
                <Metric
                  label={t('plantRepairs.metric.median')}
                  value={
                    metrics.medianSeconds === undefined
                      ? '—'
                      : formatDuration(metrics.medianSeconds)
                  }
                />
              </dl>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                <span className="mr-auto flex items-center gap-1.5 text-body-sm text-muted-foreground">
                  <WrenchIcon className="size-4" aria-hidden />
                  {t('plantRepairs.byExpert', {
                    expert: guide.expert,
                    steps: guide.procedure.steps.length,
                  })}
                </span>
                <Button asChild variant="outline" size="sm">
                  <Link href={`${base}/${encodeURIComponent(guide.id)}`}>
                    {t('plantRepairs.open')}
                  </Link>
                </Button>
                {guide.status === 'approved' ? (
                  <Button asChild size="sm">
                    <Link href={`${base}/${encodeURIComponent(guide.id)}/guide`}>
                      <PlayIcon />
                      {t('plantRepairs.startGuided')}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-micro text-muted-foreground">{label}</dt>
      <dd className="text-label tabular-nums">{value}</dd>
    </div>
  );
}
