'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightIcon, PlayIcon, PlusIcon, UploadIcon, VideoIcon } from 'lucide-react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/_components/ui/dialog';
import { Input } from '@/app/_components/ui/input';
import { Label } from '@/app/_components/ui/label';
import { PageBar } from '@/app/_components/ui/page-bar';
import type { PlantSiteSummary } from '@/src/entities/models/plant-model';
import {
  openWhyQuestions,
  transferMetrics,
  type RepairGuide,
} from '@/src/entities/models/repair-guide';
import type { PlantModelController } from '@/src/interface-adapters/controllers/plant-model/plant-model.controller';
import type { RepairGuideController } from '@/src/interface-adapters/controllers/plant-model/repair-guide.controller';

import { FloorSketch } from './floor-sketch';

const minutes = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * The plant model's landing: the two ways to start a plant's know-how
 * (walk the floor, capture a repair), every plant, and the latest repair
 * guides across them. Creating a plant by hand is a dialog off the header.
 */
export function PlantSitesScreen({
  controller,
  repairs,
}: {
  readonly controller: PlantModelController;
  readonly repairs: RepairGuideController;
}) {
  const { t } = useTranslation();
  const [sites, setSites] = useState<readonly PlantSiteSummary[]>();
  const [guides, setGuides] = useState<readonly RepairGuide[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const value = await controller.listSites();
      setSites(value);
      setError('');
      const lists = await Promise.all(
        value.map((site) => repairs.list(site.id).catch(() => [] as RepairGuide[])),
      );
      setGuides(lists.flat().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch {
      setSites([]);
      setError(t('plantModel.loadError'));
    }
  }, [controller, repairs, t]);

  useEffect(() => {
    let active = true;
    void controller.listSites().then(
      async (value) => {
        if (!active) return;
        setSites(value);
        const lists = await Promise.all(
          value.map((site) => repairs.list(site.id).catch(() => [] as RepairGuide[])),
        );
        if (active) {
          setGuides(lists.flat().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        }
      },
      () => {
        if (active) {
          setSites([]);
          setError(t('plantModel.loadError'));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [controller, repairs, t]);

  const summary = useMemo(() => {
    const runs = guides.flatMap((guide) => guide.runs);
    const fixed = runs.filter((run) => run.outcome === 'fixed').length;
    return {
      runs: runs.length,
      firstTimeFix: runs.length === 0 ? undefined : Math.round((fixed / runs.length) * 100),
      openWhy: guides.reduce((count, guide) => count + openWhyQuestions(guide).length, 0),
    };
  }, [guides]);

  const firstSite = sites?.[0];
  const latestApproved = guides.find((guide) => guide.status === 'approved');
  const repairsHref =
    firstSite === undefined
      ? undefined
      : `/plant-model/${encodeURIComponent(guides[0]?.siteId ?? firstSite.id)}/repairs`;

  return (
    <main className="flex flex-col gap-8">
      <PageBar
        eyebrow={
          <>
            {t('nav.group.data')} · {t('nav.plantModel')}
          </>
        }
        title={t('plantModel.title')}
        description={
          <span className="font-mono tabular-nums">
            {t('plantHub.counts', {
              plants: sites?.length ?? 0,
              guides: guides.length,
              runs: summary.runs,
            })}
          </span>
        }
        actions={
          <Button variant="outline" onClick={() => setCreating(true)}>
            <PlusIcon />
            {t('plantModel.createPlant')}
          </Button>
        }
      />

      {error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2" aria-label={t('plantHub.featuresLabel')}>
        <article className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="flex flex-col gap-3 p-6">
            <p className="font-mono text-micro tracking-[0.12em] text-muted-foreground uppercase">
              01 · {t('plantHub.twin.eyebrow')}
            </p>
            <h2 className="text-heading-3">{t('plantHub.twin.title')}</h2>
            <p className="text-body-md text-muted-foreground">{t('plantHub.twin.body')}</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <Button asChild>
                <Link href="/plant-model/walkthrough">
                  <UploadIcon />
                  {t('plantHub.twin.cta')}
                </Link>
              </Button>
            </div>
          </div>
          <FloorSketch className="hidden h-full w-full border-l bg-muted/40 sm:block" />
        </article>

        <article className="flex flex-col gap-3 rounded-xl border bg-card p-6">
          <p className="font-mono text-micro tracking-[0.12em] text-muted-foreground uppercase">
            02 · {t('plantHub.repair.eyebrow')}
          </p>
          <h2 className="text-heading-3">{t('plantHub.repair.title')}</h2>
          <p className="text-body-md text-muted-foreground">{t('plantHub.repair.body')}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success" className="font-mono">
              {summary.firstTimeFix === undefined
                ? t('plantHub.repair.noRuns')
                : t('plantHub.repair.firstTimeFix', { percent: summary.firstTimeFix })}
            </Badge>
            {summary.openWhy > 0 ? (
              <Badge variant="warning" className="font-mono">
                {t('plantHub.repair.openWhy', { count: summary.openWhy })}
              </Badge>
            ) : null}
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            {repairsHref !== undefined ? (
              <Button asChild>
                <Link href={`${repairsHref}/capture`}>
                  <VideoIcon />
                  {t('plantHub.repair.capture')}
                </Link>
              </Button>
            ) : (
              <Button disabled>
                <VideoIcon />
                {t('plantHub.repair.capture')}
              </Button>
            )}
            {latestApproved !== undefined ? (
              <Button asChild variant="outline">
                <Link
                  href={`/plant-model/${encodeURIComponent(latestApproved.siteId)}/repairs/${encodeURIComponent(latestApproved.id)}/guide`}
                >
                  <PlayIcon />
                  {t('plantHub.repair.guide')}
                </Link>
              </Button>
            ) : null}
          </div>
        </article>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section
          className="overflow-hidden rounded-xl border bg-card"
          aria-label={t('plantHub.plants')}
        >
          <header className="border-b px-5 py-3">
            <h2 className="font-mono text-micro tracking-[0.12em] text-muted-foreground uppercase">
              {t('plantHub.plants')}
            </h2>
          </header>
          {sites !== undefined && sites.length === 0 && !error ? (
            <p className="px-5 py-6 text-body-sm text-muted-foreground">
              {t('plantModel.emptySites')}
            </p>
          ) : null}
          <ul className="divide-y">
            {(sites ?? []).map((site) => (
              <li key={site.id}>
                <Link
                  href={`/plant-model/${encodeURIComponent(site.id)}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-5 py-3 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-label">{site.name}</span>
                    <span className="block truncate font-mono text-micro text-muted-foreground">
                      {site.code}
                    </span>
                  </span>
                  <span className="font-mono text-body-sm text-muted-foreground tabular-nums">
                    {t('plantModel.siteSummary', {
                      nodes: site.nodeCount,
                      routes: site.routeCount,
                    })}
                  </span>
                  {site.latestPublishedVersion !== undefined ? (
                    <Badge variant="success" className="font-mono">
                      {t('plantHub.published', { version: site.latestPublishedVersion })}
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="font-mono">
                      {t('plantHub.draft')}
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="overflow-hidden rounded-xl border bg-card"
          aria-label={t('plantHub.guides')}
        >
          <header className="border-b px-5 py-3">
            <h2 className="font-mono text-micro tracking-[0.12em] text-muted-foreground uppercase">
              {t('plantHub.guides')}
            </h2>
          </header>
          {guides.length === 0 ? (
            <p className="px-5 py-6 text-body-sm text-muted-foreground">{t('plantHub.noGuides')}</p>
          ) : null}
          <ul className="divide-y">
            {guides.slice(0, 6).map((guide) => (
              <li key={guide.id}>
                <Link
                  href={`/plant-model/${encodeURIComponent(guide.siteId)}/repairs/${encodeURIComponent(guide.id)}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label">{guide.faultName}</span>
                    <span className="block truncate text-micro text-muted-foreground">
                      {guide.machineName} · {guide.expert}
                    </span>
                  </span>
                  <span className="font-mono text-body-sm text-muted-foreground tabular-nums">
                    {minutes(transferMetrics(guide).expertSeconds)}
                  </span>
                  <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <CreatePlantDialog
        open={creating}
        onOpenChange={setCreating}
        create={async (input) => {
          await controller.createSite(input);
          await load();
        }}
      />
    </main>
  );
}

function CreatePlantDialog({
  open,
  onOpenChange,
  create,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly create: (input: { name: string; code: string }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!name.trim() || !code.trim()) return;
    setBusy(true);
    setError('');
    try {
      await create({ name, code });
      setName('');
      setCode('');
      onOpenChange(false);
    } catch {
      setError(t('plantModel.createError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('plantModel.createPlant')}</DialogTitle>
          <DialogDescription>{t('plantModel.subtitle')}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="plant-name">{t('plantModel.name')}</Label>
            <Input id="plant-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plant-code">{t('plantModel.code')}</Label>
            <Input
              id="plant-code"
              className="font-mono"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/[^A-Za-z0-9_]/gu, '_'))}
            />
          </div>
          {error ? (
            <p role="alert" className="text-body-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim() || !code.trim()}>
              <PlusIcon />
              {t('plantModel.createPlant')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
