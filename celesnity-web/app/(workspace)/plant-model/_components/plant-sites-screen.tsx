'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FactoryIcon, PlusIcon } from 'lucide-react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import { Label } from '@/app/_components/ui/label';
import type { PlantSiteSummary } from '@/src/entities/models/plant-model';
import type { PlantModelController } from '@/src/interface-adapters/controllers/plant-model/plant-model.controller';

export function PlantSitesScreen({ controller }: { readonly controller: PlantModelController }) {
  const { t } = useTranslation();
  const [sites, setSites] = useState<readonly PlantSiteSummary[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setSites(await controller.listSites());
      setError('');
    } catch {
      setError(t('plantModel.loadError'));
    }
  }, [controller, t]);
  useEffect(() => {
    let active = true;
    void controller.listSites().then(
      (value) => {
        if (active) {
          setSites(value);
          setError('');
        }
      },
      () => {
        if (active) setError(t('plantModel.loadError'));
      },
    );
    return () => {
      active = false;
    };
  }, [controller, t]);

  async function createSite() {
    if (!name.trim() || !code.trim()) return;
    setBusy(true);
    try {
      await controller.createSite({ name, code });
      setName('');
      setCode('');
      await load();
    } catch {
      setError(t('plantModel.createError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('plantModel.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('plantModel.subtitle')}</p>
      </header>
      <section className="grid gap-3 rounded-xl border bg-card p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="plant-name">{t('plantModel.name')}</Label>
          <Input id="plant-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plant-code">{t('plantModel.code')}</Label>
          <Input
            id="plant-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^A-Za-z0-9_]/gu, '_'))}
          />
        </div>
        <Button disabled={busy || !name.trim() || !code.trim()} onClick={() => void createSite()}>
          <PlusIcon />
          {t('plantModel.createPlant')}
        </Button>
      </section>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sites.map((site) => (
          <Link
            key={site.id}
            href={`/plant-model/${site.id}`}
            className="rounded-xl border bg-card p-5 transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <FactoryIcon className="size-5" />
              <h2 className="font-semibold">{site.name}</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{site.code}</p>
            <p className="mt-4 text-sm">
              {t('plantModel.siteSummary', { nodes: site.nodeCount, routes: site.routeCount })}
            </p>
          </Link>
        ))}
        {!error && sites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('plantModel.emptySites')}</p>
        ) : null}
      </section>
    </main>
  );
}
