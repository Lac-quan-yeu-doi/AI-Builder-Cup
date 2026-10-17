'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, FileVideoIcon, SparklesIcon, UploadIcon, XIcon } from 'lucide-react';

import { useTranslation } from '@/app/_i18n/use-translation';
import type { TranslationKey } from '@/app/_i18n/en';
import { Alert, AlertDescription, AlertTitle } from '@/app/_components/ui/alert';
import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import { Label } from '@/app/_components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/app/_components/ui/native-select';
import { ShimmerText } from '@/app/_components/ui/shimmer-text';
import { Spinner } from '@/app/_components/ui/spinner';
import type { RepairGuideController } from '@/src/interface-adapters/controllers/plant-model/repair-guide.controller';

import { usePlantWorkspace } from '../../_components/plant-workspace-context';

const OTHER = '__other__';

export function RepairCaptureScreen({
  controller,
  siteId,
}: {
  readonly controller: RepairGuideController;
  readonly siteId: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { site } = usePlantWorkspace();
  const machines = useMemo(() => {
    const types = new Map((site?.draft.nodeTypes ?? []).map((type) => [type.id, type.name]));
    return (site?.draft.nodes ?? [])
      .map((node) => ({ id: node.id, name: node.name, type: types.get(node.nodeTypeId) ?? '' }))
      .filter((node) => !/^(area|line|site|facility|khu|line)$/iu.test(node.type))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [site]);

  const [machineId, setMachineId] = useState('');
  const [otherMachine, setOtherMachine] = useState('');
  const [fault, setFault] = useState('');
  const [expert, setExpert] = useState('');
  const [file, setFile] = useState<File>();
  const [videoSeconds, setVideoSeconds] = useState<number>();
  const [working, setWorking] = useState<number>();
  const [error, setError] = useState('');
  const request = useRef<AbortController>(undefined);
  useEffect(() => () => request.current?.abort(), []);

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

  const chosen = machines.find((machine) => machine.id === machineId);
  const machineName = machineId === OTHER ? otherMachine.trim() : (chosen?.name ?? '');
  const ready =
    machineName !== '' && fault.trim() !== '' && expert.trim() !== '' && file !== undefined;

  async function capture() {
    if (!ready) return;
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    setWorking(Date.now());
    setError('');
    try {
      const guide = await controller.capture(
        {
          siteId,
          machineId: chosen?.id,
          machineName,
          faultName: fault,
          expert,
          videoSeconds,
        },
        file,
        abort.signal,
      );
      router.push(
        `/plant-model/${encodeURIComponent(siteId)}/repairs/${encodeURIComponent(guide.id)}`,
      );
    } catch (caught: unknown) {
      if (abort.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : t('plantRepairs.captureFailed'));
      setWorking(undefined);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href={`/plant-model/${encodeURIComponent(siteId)}/repairs`}>
            <ArrowLeftIcon />
            {t('plantRepairs.title')}
          </Link>
        </Button>
        <h1 className="text-heading-2">{t('plantRepairs.captureTitle')}</h1>
        <p className="max-w-3xl text-body-md text-muted-foreground">
          {t('plantRepairs.captureSubtitle')}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="repair-machine">{t('plantRepairs.machine')}</Label>
            <NativeSelect
              id="repair-machine"
              value={machineId}
              onChange={(event) => setMachineId(event.target.value)}
            >
              <NativeSelectOption value="">{t('plantRepairs.chooseMachine')}</NativeSelectOption>
              {machines.map((machine) => (
                <NativeSelectOption key={machine.id} value={machine.id}>
                  {machine.type ? `${machine.name} · ${machine.type}` : machine.name}
                </NativeSelectOption>
              ))}
              <NativeSelectOption value={OTHER}>
                {t('plantRepairs.otherMachine')}
              </NativeSelectOption>
            </NativeSelect>
            {machineId === OTHER ? (
              <Input
                aria-label={t('plantRepairs.machine')}
                value={otherMachine}
                onChange={(event) => setOtherMachine(event.target.value)}
              />
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="repair-fault">{t('plantRepairs.fault')}</Label>
            <Input
              id="repair-fault"
              placeholder={t('plantRepairs.faultPlaceholder')}
              value={fault}
              onChange={(event) => setFault(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repair-expert">{t('plantRepairs.expert')}</Label>
            <Input
              id="repair-expert"
              placeholder={t('plantRepairs.expertPlaceholder')}
              value={expert}
              onChange={(event) => setExpert(event.target.value)}
            />
          </div>
          <div className="rounded-lg bg-muted/50 p-4 text-body-sm text-muted-foreground">
            <p className="text-label text-foreground">{t('plantRepairs.tipsTitle')}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>{t('plantRepairs.tip.talk')}</li>
              <li>{t('plantRepairs.tip.numbers')}</li>
              <li>{t('plantRepairs.tip.why')}</li>
              <li>{t('plantRepairs.tip.mic')}</li>
            </ul>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          {videoUrl === undefined ? (
            <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/40 p-6 text-center hover:bg-muted">
              <UploadIcon className="size-6 text-muted-foreground" aria-hidden />
              <span className="text-title">{t('plantRepairs.dropVideo')}</span>
              <span className="text-body-sm text-muted-foreground">
                {t('plantRepairs.dropVideoHint')}
              </span>
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={(event) => {
                  const next = event.target.files?.[0];
                  if (next?.type.startsWith('video/') === true) setFile(next);
                  else if (next !== undefined) setError(t('plantWalkthrough.notVideo'));
                }}
              />
            </label>
          ) : (
            <div className="flex flex-col gap-2">
              <video
                src={videoUrl}
                controls
                playsInline
                onLoadedMetadata={(event) => setVideoSeconds(event.currentTarget.duration)}
                className="aspect-video w-full rounded-xl bg-foreground object-contain"
              />
              <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
                <FileVideoIcon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{file?.name}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto"
                  aria-label={t('plantWalkthrough.removeVideo')}
                  onClick={() => setFile(undefined)}
                >
                  <XIcon />
                </Button>
              </div>
            </div>
          )}
          <Button disabled={!ready || working !== undefined} onClick={() => void capture()}>
            {working !== undefined ? <Spinner /> : <SparklesIcon />}
            {t('plantRepairs.captureButton')}
          </Button>
          {working !== undefined ? <Working startedAt={working} /> : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{t('plantRepairs.captureFailed')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </section>
      </div>
    </div>
  );
}

const STEPS: readonly { readonly after: number; readonly label: TranslationKey }[] = [
  { after: 0, label: 'plantRepairs.working.upload' },
  { after: 8, label: 'plantRepairs.working.watch' },
  { after: 20, label: 'plantRepairs.working.steps' },
  { after: 35, label: 'plantRepairs.working.why' },
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
