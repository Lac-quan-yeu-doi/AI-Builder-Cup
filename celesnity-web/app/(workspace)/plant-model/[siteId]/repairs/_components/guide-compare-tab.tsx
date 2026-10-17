'use client';

import { useEffect, useRef, useState } from 'react';
import { GitCompareIcon, UploadIcon } from 'lucide-react';

import { useTranslation } from '@/app/_i18n/use-translation';
import type { BadgeVariant } from '@/app/_components/ui/badge';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import { Label } from '@/app/_components/ui/label';
import { ShimmerText } from '@/app/_components/ui/shimmer-text';
import { Spinner } from '@/app/_components/ui/spinner';
import type { RepairGuide } from '@/src/entities/models/repair-guide';
import type { RepairGuideController } from '@/src/interface-adapters/controllers/plant-model/repair-guide.controller';

import { useGuideVideo } from './use-guide-video';

const RISK_LABEL = {
  low: 'plantRepairs.risk.low',
  medium: 'plantRepairs.risk.medium',
  high: 'plantRepairs.risk.high',
} as const;

const RISK_TONE: Record<'low' | 'medium' | 'high', BadgeVariant> = {
  low: 'outline',
  medium: 'warning',
  high: 'danger',
};

export function GuideCompareTab({
  guide,
  controller,
  onChange,
}: {
  readonly guide: RepairGuide;
  readonly controller: RepairGuideController;
  readonly onChange: (guide: RepairGuide) => void;
}) {
  const { t } = useTranslation();
  const [expert, setExpert] = useState('');
  const [file, setFile] = useState<File>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController>(undefined);
  useEffect(() => () => request.current?.abort(), []);
  const first = useGuideVideo(guide.id, (key) => controller.video(key));
  const second = useGuideVideo(
    guide.comparison === undefined ? `${guide.id}:none` : guide.id,
    (key) => (key.endsWith(':none') ? Promise.resolve(undefined) : controller.comparisonVideo(key)),
  );

  async function compare() {
    if (file === undefined || expert.trim() === '') return;
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    setWorking(true);
    setError('');
    try {
      onChange(await controller.compare(guide.id, expert, file, abort.signal));
    } catch (caught: unknown) {
      if (!abort.signal.aborted) {
        setError(caught instanceof Error ? caught.message : t('plantRepairs.compareFailed'));
      }
    } finally {
      setWorking(false);
    }
  }

  const result = guide.comparison?.result;

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-body-md text-muted-foreground">
        {t('plantRepairs.compareIntro')}
      </p>

      <section className="grid max-w-4xl gap-3 rounded-xl border bg-card p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="compare-expert">{t('plantRepairs.secondExpert')}</Label>
          <Input
            id="compare-expert"
            value={expert}
            onChange={(event) => setExpert(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="compare-video">{t('plantRepairs.secondVideo')}</Label>
          <label
            htmlFor="compare-video"
            className="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-body-sm text-muted-foreground hover:bg-accent"
          >
            <UploadIcon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{file?.name ?? t('plantRepairs.chooseVideo')}</span>
          </label>
          <input
            id="compare-video"
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        </div>
        <Button
          disabled={working || file === undefined || expert.trim() === ''}
          onClick={() => void compare()}
        >
          {working ? <Spinner /> : <GitCompareIcon />}
          {t('plantRepairs.compareButton')}
        </Button>
      </section>
      {working ? (
        <p className="flex items-center gap-2 text-body-md" role="status">
          <Spinner className="text-muted-foreground" />
          <ShimmerText>{t('plantRepairs.comparing')}</ShimmerText>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}

      {result !== undefined && guide.comparison !== undefined ? (
        <section className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                [guide.expert, first],
                [guide.comparison.expert, second],
              ] as const
            ).map(([name, src]) => (
              <figure key={name} className="flex flex-col gap-2">
                {src === undefined ? (
                  <div className="aspect-video rounded-xl bg-muted" aria-hidden />
                ) : (
                  <video
                    src={src}
                    controls
                    playsInline
                    className="aspect-video w-full rounded-xl bg-foreground object-contain"
                  />
                )}
                <figcaption className="text-label">{name}</figcaption>
              </figure>
            ))}
          </div>
          <p className="max-w-3xl text-body-md">{result.summary}</p>
          <p className="text-body-sm text-muted-foreground">
            {t('plantRepairs.sharedSteps', { count: result.sharedSteps })}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-body-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t('plantRepairs.diff.step')}</th>
                  <th className="py-2 pr-3 font-medium">{guide.expert}</th>
                  <th className="py-2 pr-3 font-medium">{guide.comparison.expert}</th>
                  <th className="py-2 pr-3 font-medium">{t('plantRepairs.diff.why')}</th>
                  <th className="py-2 font-medium">{t('plantRepairs.diff.risk')}</th>
                </tr>
              </thead>
              <tbody className="divide-y align-top">
                {result.differences.map((difference) => (
                  <tr key={difference.step}>
                    <td className="py-2 pr-3 text-label">{difference.step}</td>
                    <td className="py-2 pr-3">{difference.expertA}</td>
                    <td className="py-2 pr-3">{difference.expertB}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{difference.whyItMatters}</td>
                    <td className="py-2">
                      <Badge variant={RISK_TONE[difference.risk]}>
                        {t(RISK_LABEL[difference.risk])}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="max-w-3xl rounded-xl border bg-card p-4">
            <p className="text-label">{t('plantRepairs.recommendation')}</p>
            <p className="mt-1 text-body-md">{result.recommendation}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
