'use client';

import { useRef, useState } from 'react';
import { CircleHelpIcon, MicIcon, PlayIcon, ShieldAlertIcon } from 'lucide-react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Checkbox } from '@/app/_components/ui/checkbox';
import { Textarea } from '@/app/_components/ui/textarea';
import {
  formatParameter,
  parameterKey,
  safetyKey,
  type RepairGuide,
} from '@/src/entities/models/repair-guide';
import { formatTimestamp } from '@/src/entities/models/video-timestamp';
import type { RepairGuideController } from '@/src/interface-adapters/controllers/plant-model/repair-guide.controller';

import { useGuideVideo } from './use-guide-video';
import { useSpeech } from './use-speech';

export function GuideProcedureTab({
  guide,
  controller,
  onChange,
}: {
  readonly guide: RepairGuide;
  readonly controller: RepairGuideController;
  readonly onChange: (guide: RepairGuide) => void;
}) {
  const { t, locale } = useTranslation();
  const src = useGuideVideo(guide.id, (key) => controller.video(key));
  const player = useRef<HTMLVideoElement>(null);
  const speech = useSpeech(locale);
  const [answers, setAnswers] = useState<Readonly<Record<number, string>>>(guide.answers);
  const { procedure } = guide;

  const seek = (seconds: number) => {
    const element = player.current;
    if (element === null) return;
    element.currentTime = seconds;
    void element.play().catch(() => undefined);
  };
  const confirm = (key: string, value: boolean) =>
    onChange({ ...guide, confirmations: { ...guide.confirmations, [key]: value } });
  const saveAnswer = (index: number) => {
    if ((answers[index] ?? '') === (guide.answers[index] ?? '')) return;
    onChange({ ...guide, answers: { ...guide.answers, [index]: answers[index] ?? '' } });
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:items-start">
      <aside className="flex flex-col gap-4 xl:sticky xl:top-4">
        {src === undefined ? (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-muted p-4 text-center text-body-sm text-muted-foreground">
            {t('plantRepairs.videoMissing')}
          </div>
        ) : (
          <video
            ref={player}
            src={src}
            controls
            playsInline
            className="aspect-video w-full rounded-xl bg-foreground object-contain"
          />
        )}
        <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-body-sm">
          <div>
            <dt className="text-micro text-muted-foreground">{t('plantRepairs.symptom')}</dt>
            <dd>{procedure.faultSymptom}</dd>
          </div>
          <div>
            <dt className="text-micro text-muted-foreground">{t('plantRepairs.outcome')}</dt>
            <dd>{procedure.outcome}</dd>
          </div>
          {procedure.tools.length > 0 ? (
            <div>
              <dt className="text-micro text-muted-foreground">{t('plantRepairs.tools')}</dt>
              <dd>{procedure.tools.join(', ')}</dd>
            </div>
          ) : null}
          {procedure.parts.length > 0 ? (
            <div>
              <dt className="text-micro text-muted-foreground">{t('plantRepairs.parts')}</dt>
              <dd>{procedure.parts.join(', ')}</dd>
            </div>
          ) : null}
        </dl>
        {procedure.prerequisites.length > 0 ? (
          <section className="rounded-xl border bg-card p-4">
            <h3 className="text-label">{t('plantRepairs.beforeStart')}</h3>
            <ul className="mt-2 space-y-1 text-body-sm">
              {procedure.prerequisites.map((item) => (
                <li key={item.text} className="flex items-start gap-2">
                  {item.safety ? (
                    <ShieldAlertIcon
                      className="mt-0.5 size-4 shrink-0 text-destructive"
                      aria-hidden
                    />
                  ) : (
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground"
                      aria-hidden
                    />
                  )}
                  {item.text}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {procedure.openQuestions.length > 0 ? (
          <section className="rounded-xl border bg-card p-4">
            <h3 className="flex items-center gap-2 text-label">
              <CircleHelpIcon className="size-4 text-status-info" aria-hidden />
              {t('plantRepairs.reviewerQuestions')}
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm">
              {procedure.openQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>

      <ol className="flex flex-col gap-4">
        {procedure.steps.map((step, index) => {
          const answer = answers[index] ?? '';
          return (
            <li key={`${index}-${step.title}`} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-title">
                  <span className="text-muted-foreground tabular-nums">{index + 1}. </span>
                  {step.title}
                </h3>
                <div className="flex items-center gap-2">
                  {step.safetyCritical ? (
                    <Badge variant="danger">{t('plantRepairs.safety')}</Badge>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="xs"
                    className="tabular-nums"
                    disabled={src === undefined}
                    aria-label={t('plantWalkthrough.panel.play', {
                      time: formatTimestamp(step.startSec),
                    })}
                    onClick={() => seek(step.startSec)}
                  >
                    <PlayIcon />
                    {formatTimestamp(step.startSec)}–{formatTimestamp(step.endSec)}
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-body-md">{step.instruction}</p>
              {step.tools.length > 0 ? (
                <p className="mt-2 text-body-sm text-muted-foreground">
                  {t('plantRepairs.tools')}: {step.tools.join(', ')}
                </p>
              ) : null}

              {step.parameters.length > 0 || step.safetyCritical ? (
                <div className="mt-4 flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
                  {step.parameters.map((parameter, position) => {
                    const key = parameterKey(index, position);
                    return (
                      <label key={key} className="flex items-start gap-3 text-body-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={guide.confirmations[key] === true}
                          onCheckedChange={(checked) => confirm(key, checked === true)}
                        />
                        <span>
                          <span className="text-label">{formatParameter(parameter)}</span>
                          {parameter.heard ? (
                            <span className="text-muted-foreground">
                              {' · '}
                              {t('plantRepairs.heard', { words: parameter.heard })}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                  {step.safetyCritical ? (
                    <label className="flex items-start gap-3 text-body-sm">
                      <Checkbox
                        className="mt-0.5"
                        checked={guide.confirmations[safetyKey(index)] === true}
                        onCheckedChange={(checked) => confirm(safetyKey(index), checked === true)}
                      />
                      <span>
                        <span className="text-label text-destructive">
                          {t('plantRepairs.safetyConfirm')}
                        </span>{' '}
                        {step.safetyNote}
                      </span>
                    </label>
                  ) : null}
                </div>
              ) : null}

              {step.rationale !== '' ? (
                <p className="mt-4 text-body-sm">
                  <span className="text-label">{t('plantRepairs.why')}: </span>
                  {step.rationale}
                </p>
              ) : step.rationaleQuestion !== '' ? (
                <div className="mt-4 flex flex-col gap-2 rounded-lg border border-dashed p-3">
                  <p className="flex items-start gap-2 text-body-sm">
                    <CircleHelpIcon
                      className="mt-0.5 size-4 shrink-0 text-status-info"
                      aria-hidden
                    />
                    <span>
                      <span className="text-label">{t('plantRepairs.askExpert')}: </span>
                      {step.rationaleQuestion}
                    </span>
                  </p>
                  <div className="flex items-start gap-2">
                    <Textarea
                      aria-label={step.rationaleQuestion}
                      placeholder={t('plantRepairs.answerPlaceholder', { expert: guide.expert })}
                      value={answer}
                      rows={2}
                      onChange={(event) =>
                        setAnswers((current) => ({ ...current, [index]: event.target.value }))
                      }
                      onBlur={() => saveAnswer(index)}
                    />
                    {speech.canListen ? (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={t('plantRepairs.dictate')}
                        onClick={() =>
                          speech.dictate((text) => {
                            const next = `${answer} ${text}`.trim();
                            setAnswers((current) => ({ ...current, [index]: next }));
                            onChange({ ...guide, answers: { ...guide.answers, [index]: next } });
                          })
                        }
                      >
                        <MicIcon />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
