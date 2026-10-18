'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileVideoIcon, PlusIcon, SparklesIcon, UploadIcon, XIcon } from 'lucide-react';

import { useTranslation } from '@/app/_i18n/use-translation';
import type { TranslationKey } from '@/app/_i18n/en';
import { Alert, AlertDescription, AlertTitle } from '@/app/_components/ui/alert';
import { Button } from '@/app/_components/ui/button';
import { PageBar } from '@/app/_components/ui/page-bar';
import { Input } from '@/app/_components/ui/input';
import { Label } from '@/app/_components/ui/label';
import { ShimmerText } from '@/app/_components/ui/shimmer-text';
import { Spinner } from '@/app/_components/ui/spinner';
import {
  normalizeTwinTimes,
  walkthroughToTwin,
  type ExtractedTwin,
} from '@/src/entities/models/plant-walkthrough';
import type { PlantWalkthroughController } from '@/src/interface-adapters/controllers/plant-model/plant-walkthrough.controller';

import { WalkthroughResults } from './walkthrough-results';
import { PELLET_LINE_SAMPLE } from './walkthrough-sample';

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working'; readonly startedAt: number }
  | { readonly kind: 'done'; readonly twin: ExtractedTwin; readonly meta: string }
  | { readonly kind: 'failed'; readonly message: string };

export function PlantWalkthroughScreen({
  controller,
}: {
  readonly controller: PlantWalkthroughController;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [file, setFile] = useState<File>();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const request = useRef<AbortController>(undefined);

  const videoUrl = useMemo(
    () => (file === undefined ? undefined : URL.createObjectURL(file)),
    [file],
  );
  useEffect(
    () => () => {
      if (videoUrl !== undefined) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );
  useEffect(() => () => request.current?.abort(), []);

  const choose = (next: File | undefined) => {
    if (next === undefined) return;
    request.current?.abort();
    if (!next.type.startsWith('video/')) {
      setPhase({ kind: 'failed', message: t('plantWalkthrough.notVideo') });
      return;
    }
    setFile(next);
    setPhase({ kind: 'idle' });
  };

  const extract = async () => {
    if (file === undefined) return;
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    setPhase({ kind: 'working', startedAt: Date.now() });
    try {
      const result = await controller.extract(file, abort.signal);
      const videoSeconds = player.current?.duration;
      setPhase({
        kind: 'done',
        twin:
          videoSeconds === undefined || Number.isNaN(videoSeconds)
            ? result.twin
            : normalizeTwinTimes(result.twin, videoSeconds),
        meta: t('plantWalkthrough.meta', {
          model: result.model,
          seconds: Math.round(result.elapsedMs / 1000),
          tokens: (result.inputTokens ?? 0).toLocaleString(),
        }),
      });
    } catch (error: unknown) {
      if (abort.signal.aborted) return;
      setPhase({
        kind: 'failed',
        message: error instanceof Error ? error.message : t('plantWalkthrough.failed'),
      });
    }
  };

  const showSample = () => {
    request.current?.abort();
    setFile(undefined);
    setPhase({
      kind: 'done',
      twin: walkthroughToTwin(PELLET_LINE_SAMPLE),
      meta: t('plantWalkthrough.metaSample'),
    });
  };

  const seek = useCallback((seconds: number) => {
    const video = player.current;
    if (video === null) return;
    video.currentTime = seconds;
    video.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    void video.play().catch(() => undefined);
  }, []);

  const working = phase.kind === 'working';

  return (
    <main className="space-y-8">
      <PageBar
        backTo={{ href: '/plant-model', label: t('plantWalkthrough.back') }}
        eyebrow={
          <>
            {t('nav.group.data')} · {t('nav.plantModel')}
          </>
        }
        title={t('plantWalkthrough.title')}
        description={t('plantWalkthrough.subtitle')}
      />

      <div className="grid gap-10 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)] xl:items-start">
        <div className="flex flex-col gap-4 xl:sticky xl:top-8">
          {videoUrl === undefined ? (
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                choose(event.dataTransfer.files[0]);
              }}
              className={`flex aspect-video cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center transition-colors hover:bg-muted ${
                dragging ? 'border-ring bg-status-info-light' : 'bg-muted/40'
              }`}
            >
              <UploadIcon className="size-6 text-muted-foreground" aria-hidden />
              <span className="text-title">{t('plantWalkthrough.drop')}</span>
              <span className="text-body-sm text-muted-foreground">
                {t('plantWalkthrough.dropHint')}
              </span>
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={(event) => choose(event.target.files?.[0])}
              />
            </label>
          ) : (
            <div className="flex flex-col gap-2">
              <video
                ref={player}
                src={videoUrl}
                controls
                playsInline
                className="aspect-video w-full rounded-xl bg-foreground object-contain"
              />
              <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
                <FileVideoIcon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{file?.name}</span>
                <span className="shrink-0 tabular-nums">
                  {file === undefined ? '' : `${(file.size / 1024 ** 2).toFixed(1)} MB`}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto"
                  aria-label={t('plantWalkthrough.removeVideo')}
                  onClick={() => {
                    request.current?.abort();
                    setFile(undefined);
                    setPhase({ kind: 'idle' });
                  }}
                >
                  <XIcon />
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void extract()} disabled={file === undefined || working}>
              {working ? <Spinner /> : <SparklesIcon />}
              {t('plantWalkthrough.map')}
            </Button>
            <Button variant="outline" onClick={showSample} disabled={working}>
              {t('plantWalkthrough.sample')}
            </Button>
          </div>
          <p className="text-micro text-muted-foreground">{t('plantWalkthrough.sampleCredit')}</p>
        </div>

        <div className="min-w-0">
          {phase.kind === 'idle' && (
            <div className="flex flex-col gap-3 text-body-md text-muted-foreground">
              <h2 className="text-heading-2 text-foreground">{t('plantWalkthrough.introTitle')}</h2>
              <p>{t('plantWalkthrough.introBody')}</p>
            </div>
          )}
          {phase.kind === 'working' && <Working startedAt={phase.startedAt} />}
          {phase.kind === 'failed' && (
            <Alert variant="destructive">
              <AlertTitle>{t('plantWalkthrough.failed')}</AlertTitle>
              <AlertDescription>{phase.message}</AlertDescription>
            </Alert>
          )}
          {phase.kind === 'done' && (
            <div className="flex flex-col gap-8">
              <p className="text-micro text-muted-foreground">{phase.meta}</p>
              <WalkthroughResults twin={phase.twin} videoUrl={videoUrl} onSeek={seek} />
              <CreatePlant
                key={phase.twin.siteName}
                twin={phase.twin}
                onCreate={async (input) => {
                  const site = await controller.createPlant(input, phase.twin.draft);
                  router.push(`/plant-model/${site.id}`);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function CreatePlant({
  twin,
  onCreate,
}: {
  readonly twin: ExtractedTwin;
  readonly onCreate: (input: { name: string; code: string }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(twin.siteName);
  const [code, setCode] = useState(() => codeFrom(twin.siteName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setBusy(true);
    setError('');
    try {
      await onCreate({ name, code });
    } catch {
      setError(t('plantWalkthrough.create.error'));
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="space-y-1">
        <h3 className="text-title">{t('plantWalkthrough.create.title')}</h3>
        <p className="text-body-sm text-muted-foreground">{t('plantWalkthrough.create.body')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="walkthrough-plant-name">{t('plantModel.name')}</Label>
          <Input
            id="walkthrough-plant-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="walkthrough-plant-code">{t('plantModel.code')}</Label>
          <Input
            id="walkthrough-plant-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^A-Za-z0-9_]/gu, '_'))}
          />
        </div>
        <Button disabled={busy || !name.trim() || !code.trim()} onClick={() => void create()}>
          {busy ? <Spinner /> : <PlusIcon />}
          {t('plantModel.createPlant')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** "Henan Richi Machinery Co." → "HENAN_RICHI_MACHINERY_CO". */
function codeFrom(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/gu, '')
      .replace(/đ/giu, 'd')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/gu, '_')
      .replace(/^_+|_+$/gu, '')
      .slice(0, 40) || 'PLANT'
  );
}

const STEPS: readonly { readonly after: number; readonly label: TranslationKey }[] = [
  { after: 0, label: 'plantWalkthrough.step.upload' },
  { after: 8, label: 'plantWalkthrough.step.watch' },
  { after: 20, label: 'plantWalkthrough.step.find' },
  { after: 35, label: 'plantWalkthrough.step.flow' },
];

function Working({ startedAt }: { readonly startedAt: number }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const step = [...STEPS].reverse().find((candidate) => elapsed >= candidate.after) ?? STEPS[0];
  return (
    <div className="flex items-center gap-3 text-body-md" role="status">
      <Spinner className="text-muted-foreground" />
      <ShimmerText>{step === undefined ? '' : t(step.label)}</ShimmerText>
      <span className="text-muted-foreground tabular-nums">{elapsed}s</span>
    </div>
  );
}
