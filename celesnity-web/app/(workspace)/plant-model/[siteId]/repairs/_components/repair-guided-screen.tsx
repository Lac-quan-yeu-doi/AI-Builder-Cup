'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  CheckIcon,
  MicIcon,
  MicOffIcon,
  RotateCcwIcon,
  SendIcon,
  ShieldAlertIcon,
  Volume2Icon,
} from 'lucide-react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { Alert, AlertDescription, AlertTitle } from '@/app/_components/ui/alert';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Checkbox } from '@/app/_components/ui/checkbox';
import { Input } from '@/app/_components/ui/input';
import { Label } from '@/app/_components/ui/label';
import { Progress } from '@/app/_components/ui/progress';
import { Spinner } from '@/app/_components/ui/spinner';
import { Textarea } from '@/app/_components/ui/textarea';
import {
  formatParameter,
  stepRationale,
  transferMetrics,
  type RepairAnswer,
  type RepairGuide,
  type RepairRunStep,
  type StepVerification,
} from '@/src/entities/models/repair-guide';
import type { RepairGuideController } from '@/src/interface-adapters/controllers/plant-model/repair-guide.controller';

import { formatDuration, formatPercent } from './repair-format';
import { StepClip, type StepClipHandle } from './step-clip';
import { useGuideVideo } from './use-guide-video';
import { useSpeech, voiceCommand } from './use-speech';

type Stage =
  | { readonly kind: 'prepare' }
  | { readonly kind: 'step'; readonly index: number }
  | { readonly kind: 'finish' }
  | { readonly kind: 'done'; readonly guide: RepairGuide; readonly seconds: number };

interface StepState {
  readonly seconds: number;
  readonly deviation: string;
  readonly verified?: boolean;
  readonly confirmed?: boolean;
}

export function RepairGuidedScreen({
  controller,
  siteId,
  guideId,
}: {
  readonly controller: RepairGuideController;
  readonly siteId: string;
  readonly guideId: string;
}) {
  const { t, locale } = useTranslation();
  const [guide, setGuide] = useState<RepairGuide>();
  const [error, setError] = useState('');
  const [stage, setStage] = useState<Stage>({ kind: 'prepare' });
  const [worker, setWorker] = useState('');
  const [ready, setReady] = useState<Readonly<Record<number, boolean>>>({});
  const [steps, setSteps] = useState<Readonly<Record<number, StepState>>>({});
  const [enteredAt, setEnteredAt] = useState(0);
  const [startedAt, setStartedAt] = useState('');
  const [handsFree, setHandsFree] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<RepairAnswer>();
  const [asking, setAsking] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<StepVerification>();
  const clip = useRef<StepClipHandle>(null);
  const speech = useSpeech(locale);
  const src = useGuideVideo(guideId, (key) => controller.video(key));
  const base = `/plant-model/${encodeURIComponent(siteId)}/repairs/${encodeURIComponent(guideId)}`;

  useEffect(() => {
    let active = true;
    void controller.get(guideId).then(
      (value) => {
        if (active) setGuide(value);
      },
      () => {
        if (active) setError(t('plantRepairs.notFound'));
      },
    );
    return () => {
      active = false;
    };
  }, [controller, guideId, t]);

  const total = guide?.procedure.steps.length ?? 0;
  const index = stage.kind === 'step' ? stage.index : -1;
  const step = guide?.procedure.steps[index];
  const state: StepState = steps[index] ?? { seconds: 0, deviation: '' };
  const safetyOk =
    step?.safetyCritical !== true || state.verified === true || state.confirmed === true;

  const describe = useCallback(
    (target: number) => {
      const current = guide?.procedure.steps[target];
      if (current === undefined) return '';
      const values = current.parameters.map(formatParameter).join('. ');
      return [
        t('plantRepairs.guided.stepSpoken', { number: target + 1, title: current.title }),
        current.instruction,
        values,
        current.safetyCritical ? current.safetyNote : '',
      ]
        .filter(Boolean)
        .join('. ');
    },
    [guide, t],
  );

  /** Leaves the current step, banking its time, and enters `target`. */
  const go = useCallback(
    (target: number | 'finish') => {
      const now = Date.now();
      if (index >= 0) {
        setSteps((current) => ({
          ...current,
          [index]: {
            ...(current[index] ?? { seconds: 0, deviation: '' }),
            seconds: (current[index]?.seconds ?? 0) + (now - enteredAt) / 1000,
          },
        }));
      }
      setEnteredAt(now);
      setAnswer(undefined);
      setVerification(undefined);
      if (target === 'finish') {
        setStage({ kind: 'finish' });
        if (handsFree) speech.speak(t('plantRepairs.guided.finishSpoken'));
        return;
      }
      setStage({ kind: 'step', index: target });
      if (handsFree) speech.speak(describe(target));
    },
    [describe, enteredAt, handsFree, index, speech, t],
  );

  const next = useCallback(() => {
    if (!safetyOk) {
      if (handsFree) speech.speak(t('plantRepairs.guided.safetyBlockedSpoken'));
      return;
    }
    go(index + 1 >= total ? 'finish' : index + 1);
  }, [go, handsFree, index, safetyOk, speech, t, total]);

  const ask = useCallback(
    async (text: string) => {
      if (text.trim() === '' || index < 0) return;
      setAsking(true);
      setQuestion(text);
      try {
        const reply = await controller.ask(guideId, index, text);
        setAnswer(reply);
        if (handsFree) speech.speak(reply.answer);
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : t('plantRepairs.askFailed'));
      } finally {
        setAsking(false);
      }
    },
    [controller, guideId, handsFree, index, speech, t],
  );

  // Voice commands go through a ref so recognition keeps one stable handler.
  const onPhrase = useRef<(text: string) => void>(() => undefined);
  useEffect(() => {
    onPhrase.current = (text: string) => {
      const command = voiceCommand(text);
      if (command === 'next') next();
      else if (command === 'back' && index > 0) go(index - 1);
      else if (command === 'replay') clip.current?.replay();
      else void ask(text);
    };
  }, [ask, go, index, next]);

  function toggleHandsFree() {
    if (handsFree) {
      speech.stop();
      setHandsFree(false);
      return;
    }
    setHandsFree(true);
    speech.listen((text) => onPhrase.current(text));
    if (index >= 0) speech.speak(describe(index));
  }

  async function verify(photo: File | undefined) {
    if (photo === undefined || index < 0) return;
    setVerifying(true);
    setVerification(undefined);
    try {
      const result = await controller.verifyStep(guideId, index, photo);
      setVerification(result);
      setSteps((current) => ({
        ...current,
        [index]: {
          ...(current[index] ?? { seconds: 0, deviation: '' }),
          verified: result.verified,
        },
      }));
      if (handsFree) {
        speech.speak(result.verified ? t('plantRepairs.guided.verifiedSpoken') : result.observed);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t('plantRepairs.verifyFailed'));
    } finally {
      setVerifying(false);
    }
  }

  async function finish(outcome: 'fixed' | 'not-fixed') {
    if (guide === undefined) return;
    speech.stop();
    const runSteps: RepairRunStep[] = guide.procedure.steps.map((_step, position) => ({
      index: position,
      seconds: Math.round(steps[position]?.seconds ?? 0),
      deviation: steps[position]?.deviation ?? '',
      verified: steps[position]?.verified,
    }));
    try {
      const saved = await controller.recordRun(guideId, {
        id: crypto.randomUUID(),
        worker: worker.trim(),
        startedAt,
        finishedAt: new Date().toISOString(),
        outcome,
        steps: runSteps,
      });
      setGuide(saved);
      setStage({
        kind: 'done',
        guide: saved,
        seconds: runSteps.reduce((sum, value) => sum + value.seconds, 0),
      });
    } catch {
      setError(t('plantRepairs.saveError'));
    }
  }

  if (guide === undefined) {
    return (
      <div className="flex items-center gap-2 p-6 text-body-sm text-muted-foreground">
        {error ? <span role="alert">{error}</span> : <Spinner />}
      </div>
    );
  }

  const prerequisites = guide.procedure.prerequisites;
  const safetyReady = prerequisites.every((item, position) => !item.safety || ready[position]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href={base}>
            <ArrowLeftIcon />
            {t('plantRepairs.backToGuide')}
          </Link>
        </Button>
        <div className="mr-auto min-w-0">
          <h1 className="truncate text-title">{guide.procedure.title}</h1>
          <p className="text-body-sm text-muted-foreground">
            {t('plantRepairs.machineFault', { machine: guide.machineName, fault: guide.faultName })}
          </p>
        </div>
        {guide.status !== 'approved' ? (
          <Badge variant="warning">{t('plantRepairs.guided.unapproved')}</Badge>
        ) : null}
        {speech.canListen && stage.kind === 'step' ? (
          <Button variant={handsFree ? 'default' : 'outline'} onClick={toggleHandsFree}>
            {handsFree ? <MicIcon /> : <MicOffIcon />}
            {handsFree ? t('plantRepairs.guided.handsFreeOn') : t('plantRepairs.guided.handsFree')}
          </Button>
        ) : null}
      </header>
      {stage.kind === 'step' ? (
        <div className="flex items-center gap-3">
          <Progress value={((index + 1) / total) * 100} className="flex-1" />
          <span className="text-body-sm text-muted-foreground tabular-nums">
            {t('plantRepairs.guided.stepOf', { number: index + 1, total })}
          </span>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}

      {stage.kind === 'prepare' ? (
        <section className="flex max-w-3xl flex-col gap-5 rounded-xl border bg-card p-6">
          <h2 className="text-heading-3">{t('plantRepairs.beforeStart')}</h2>
          <div className="space-y-2">
            <Label htmlFor="guided-worker">{t('plantRepairs.guided.worker')}</Label>
            <Input
              id="guided-worker"
              value={worker}
              onChange={(event) => setWorker(event.target.value)}
            />
          </div>
          <ul className="flex flex-col gap-3">
            {prerequisites.map((item, position) => (
              <li key={item.text}>
                <label className="flex items-start gap-3 text-body-md">
                  <Checkbox
                    className="mt-1"
                    checked={ready[position] === true}
                    onCheckedChange={(checked) =>
                      setReady((current) => ({ ...current, [position]: checked === true }))
                    }
                  />
                  <span className={item.safety ? 'text-destructive' : undefined}>
                    {item.safety ? `${t('plantRepairs.safety')}: ` : ''}
                    {item.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button
            className="self-start"
            disabled={worker.trim() === '' || !safetyReady}
            onClick={() => {
              setStartedAt(new Date().toISOString());
              go(0);
            }}
          >
            {t('plantRepairs.guided.start')}
            <ArrowRightIcon />
          </Button>
          {!safetyReady ? (
            <p className="text-body-sm text-muted-foreground">
              {t('plantRepairs.guided.safetyFirst')}
            </p>
          ) : null}
        </section>
      ) : null}

      {stage.kind === 'step' && step !== undefined ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="flex flex-col gap-3">
            <StepClip
              ref={clip}
              src={src}
              startSec={step.startSec}
              endSec={step.endSec}
              label={t('plantRepairs.guided.clipLabel', { expert: guide.expert })}
            />
            <div className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
              <Button variant="outline" size="sm" onClick={() => clip.current?.replay()}>
                <RotateCcwIcon />
                {t('plantRepairs.guided.showMe')}
              </Button>
              {speech.canSpeak ? (
                <Button variant="outline" size="sm" onClick={() => speech.speak(describe(index))}>
                  <Volume2Icon />
                  {t('plantRepairs.guided.readAloud')}
                </Button>
              ) : null}
              <span>{t('plantRepairs.guided.clipCaption', { expert: guide.expert })}</span>
            </div>
            {handsFree ? (
              <p className="rounded-lg bg-muted/60 p-3 text-body-sm text-muted-foreground">
                {t('plantRepairs.guided.voiceHelp')}
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-4">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-heading-3">
                <span className="text-muted-foreground tabular-nums">{index + 1}. </span>
                {step.title}
              </h2>
              <p className="mt-2 text-body-lg">{step.instruction}</p>
              {step.parameters.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {step.parameters.map((parameter) => (
                    <li key={parameter.name}>
                      <Badge variant="outline">{formatParameter(parameter)}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
              {stepRationale(guide, index) ? (
                <p className="mt-3 text-body-sm text-muted-foreground">
                  <span className="text-label text-foreground">{t('plantRepairs.why')}: </span>
                  {stepRationale(guide, index)}
                </p>
              ) : null}
            </div>

            {step.safetyCritical ? (
              <Alert variant={safetyOk ? 'default' : 'destructive'}>
                <ShieldAlertIcon />
                <AlertTitle>{t('plantRepairs.guided.safetyTitle')}</AlertTitle>
                <AlertDescription className="flex flex-col gap-3">
                  <span>{step.safetyNote}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm" disabled={verifying}>
                      <label>
                        {verifying ? <Spinner /> : <CameraIcon />}
                        {t('plantRepairs.guided.verifyPhoto')}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="sr-only"
                          onChange={(event) => void verify(event.target.files?.[0])}
                        />
                      </label>
                    </Button>
                    <label className="flex items-center gap-2 text-body-sm">
                      <Checkbox
                        checked={state.confirmed === true}
                        onCheckedChange={(checked) =>
                          setSteps((current) => ({
                            ...current,
                            [index]: { ...state, confirmed: checked === true },
                          }))
                        }
                      />
                      {t('plantRepairs.guided.confirmSafety')}
                    </label>
                  </div>
                  {verification !== undefined ? (
                    <span
                      className={verification.verified ? 'text-status-success-dark' : undefined}
                    >
                      {verification.verified
                        ? t('plantRepairs.guided.verified')
                        : t('plantRepairs.guided.notVerified')}{' '}
                      {verification.observed}
                    </span>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="guided-deviation">{t('plantRepairs.guided.deviation')}</Label>
              <Textarea
                id="guided-deviation"
                rows={2}
                placeholder={t('plantRepairs.guided.deviationPlaceholder')}
                value={state.deviation}
                onChange={(event) =>
                  setSteps((current) => ({
                    ...current,
                    [index]: { ...state, deviation: event.target.value },
                  }))
                }
              />
            </div>

            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void ask(question);
              }}
            >
              <Input
                aria-label={t('plantRepairs.guided.askLabel')}
                placeholder={t('plantRepairs.guided.askPlaceholder')}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
              <Button type="submit" variant="outline" disabled={asking || question.trim() === ''}>
                {asking ? <Spinner /> : <SendIcon />}
                {t('plantRepairs.guided.ask')}
              </Button>
            </form>
            {answer !== undefined ? (
              <div className="rounded-xl border bg-card p-4 text-body-md">
                <p>{answer.answer}</p>
                <p className="mt-2 text-micro text-muted-foreground">
                  {answer.outsideGuide
                    ? t('plantRepairs.guided.outsideGuide')
                    : t('plantRepairs.guided.citedSteps', {
                        steps: answer.stepNumbers.join(', '),
                      })}
                </p>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button variant="outline" disabled={index === 0} onClick={() => go(index - 1)}>
                <ArrowLeftIcon />
                {t('plantRepairs.guided.back')}
              </Button>
              <Button className="flex-1" disabled={!safetyOk} onClick={next}>
                <CheckIcon />
                {index + 1 >= total
                  ? t('plantRepairs.guided.lastDone')
                  : t('plantRepairs.guided.done')}
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {stage.kind === 'finish' ? (
        <section className="flex max-w-2xl flex-col gap-4 rounded-xl border bg-card p-6">
          <h2 className="text-heading-3">{t('plantRepairs.guided.checkTitle')}</h2>
          <p className="text-body-md">{guide.procedure.outcome}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void finish('fixed')}>
              <CheckIcon />
              {t('plantRepairs.outcome.fixed')}
            </Button>
            <Button variant="outline" onClick={() => void finish('not-fixed')}>
              {t('plantRepairs.outcome.notFixed')}
            </Button>
          </div>
        </section>
      ) : null}

      {stage.kind === 'done' ? (
        <DoneSummary guide={stage.guide} seconds={stage.seconds} base={base} />
      ) : null}
    </div>
  );
}

function DoneSummary({
  guide,
  seconds,
  base,
}: {
  readonly guide: RepairGuide;
  readonly seconds: number;
  readonly base: string;
}) {
  const { t } = useTranslation();
  const metrics = transferMetrics(guide);
  return (
    <section className="flex max-w-3xl flex-col gap-4 rounded-xl border bg-card p-6">
      <h2 className="text-heading-3">{t('plantRepairs.guided.doneTitle')}</h2>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className="text-body-sm text-muted-foreground">
            {t('plantRepairs.guided.yourTime')}
          </dt>
          <dd className="text-heading-3 tabular-nums">{formatDuration(seconds)}</dd>
        </div>
        <div>
          <dt className="text-body-sm text-muted-foreground">{t('plantRepairs.metric.expert')}</dt>
          <dd className="text-heading-3 tabular-nums">{formatDuration(metrics.expertSeconds)}</dd>
        </div>
        <div>
          <dt className="text-body-sm text-muted-foreground">
            {t('plantRepairs.metric.firstTimeFix')}
          </dt>
          <dd className="text-heading-3 tabular-nums">{formatPercent(metrics.firstTimeFixRate)}</dd>
        </div>
        <div>
          <dt className="text-body-sm text-muted-foreground">{t('plantRepairs.metric.runs')}</dt>
          <dd className="text-heading-3 tabular-nums">{metrics.runs}</dd>
        </div>
      </dl>
      <p className="text-body-sm text-muted-foreground">{t('plantRepairs.guided.doneBody')}</p>
      <Button asChild className="self-start">
        <Link href={base}>{t('plantRepairs.backToGuide')}</Link>
      </Button>
    </section>
  );
}
