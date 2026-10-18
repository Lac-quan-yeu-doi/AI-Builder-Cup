'use client';

import { ArrowDownLeftIcon, ArrowUpRightIcon, BoxIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { KIND_LABEL } from '@/app/(workspace)/plant-model/_components/twin/twin-labels';
import { TwinStage } from '@/app/(workspace)/plant-model/_components/twin/twin-stage';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { EmptyState } from '@/app/_components/ui/empty-state';
import { PageBar } from '@/app/_components/ui/page-bar';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { PlantSite } from '@/src/entities/models/plant-model';
import {
  plantTwinScene,
  type TwinMachine,
  type TwinScene,
} from '@/src/entities/models/plant-twin-scene';

import { usePlantWorkspace } from './plant-workspace-context';

export function PlantTwinScreen({ siteId }: { readonly siteId: string }) {
  const { t } = useTranslation();
  const { site } = usePlantWorkspace();
  const scene = useMemo(() => (site ? plantTwinScene(site.draft) : undefined), [site]);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = scene?.machines.find((machine) => machine.id === selectedId);

  if (!site || !scene) {
    return <main className="p-8 text-body-sm text-muted-foreground">{t('plantTwin.loading')}</main>;
  }

  return (
    <main
      className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 min-[900px]:p-6"
      aria-label={t('plantTwin.title')}
    >
      <PageBar
        eyebrow={
          <>
            {t('plantRail.group.plant')} · {site.name}
          </>
        }
        title={t('plantTwin.title')}
        description={t('plantTwin.description')}
      />
      {scene.machines.length === 0 ? (
        <EmptyState
          mark={<BoxIcon />}
          title={t('plantTwin.title')}
          description={t('plantTwin.empty')}
          action={
            <Button asChild variant="outline">
              <Link href={`/plant-model/${encodeURIComponent(siteId)}/model`}>
                {t('plantTwin.openModel')}
              </Link>
            </Button>
          }
        />
      ) : (
        <TwinStage
          scene={scene}
          selectedId={selectedId}
          onSelect={setSelectedId}
          showsAssumedFlows={scene.flows.some((flow) => flow.inferred)}
        >
          {selected !== undefined && (
            <MachinePanel
              key={selected.id}
              machine={selected}
              site={site}
              scene={scene}
              onClose={() => setSelectedId(undefined)}
              onSelect={setSelectedId}
            />
          )}
        </TwinStage>
      )}
    </main>
  );
}

function MachinePanel({
  machine,
  site,
  scene,
  onClose,
  onSelect,
}: {
  readonly machine: TwinMachine;
  readonly site: PlantSite;
  readonly scene: TwinScene;
  readonly onClose: () => void;
  readonly onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const names = new Map(site.draft.nodes.map((node) => [node.id, node.name]));
  const machineIds = new Set(scene.machines.map((value) => value.id));
  const place = [machine.areaId, machine.lineId]
    .flatMap((id) => (id === undefined ? [] : [names.get(id)]))
    .filter((name): name is string => name !== undefined)
    .join(' › ');
  const flows = [
    ...scene.flows
      .filter((flow) => flow.toId === machine.id)
      .map((flow) => ({ flow, other: flow.fromId, incoming: true })),
    ...scene.flows
      .filter((flow) => flow.fromId === machine.id)
      .map((flow) => ({ flow, other: flow.toId, incoming: false })),
  ];

  return (
    <aside
      className="absolute top-3 right-3 flex max-h-[calc(100%-1.5rem)] w-72 flex-col gap-3 overflow-y-auto rounded-xl border bg-card p-4 shadow-300"
      aria-label={machine.name}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-title">{machine.name}</h3>
          <p className="text-body-sm text-muted-foreground">
            {machine.equipmentType || t(KIND_LABEL[machine.kind])}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t('plantWalkthrough.panel.close')}
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{t(KIND_LABEL[machine.kind])}</Badge>
        {place !== '' && (
          <span className="text-body-sm text-muted-foreground">
            {t('plantTwin.panel.in', { name: place })}
          </span>
        )}
      </div>

      {flows.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-label text-muted-foreground">{t('plantWalkthrough.panel.flow')}</h4>
          <ul className="flex flex-col gap-1 text-body-sm">
            {flows.map(({ flow, other, incoming }) => {
              const Icon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
              const name = names.get(other) ?? other;
              const text = incoming
                ? t('plantWalkthrough.panel.from', { name })
                : t('plantWalkthrough.panel.to', { name });
              return (
                <li key={flow.id} className="flex items-start gap-1.5">
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    {/* A route may end at a work center rather than a machine; it has no light to select. */}
                    {machineIds.has(other) ? (
                      <Button
                        variant="link"
                        size="xs"
                        className="h-auto p-0"
                        onClick={() => onSelect(other)}
                      >
                        {text}
                      </Button>
                    ) : (
                      text
                    )}
                    {flow.material !== '' && (
                      <span className="text-muted-foreground"> · {flow.material}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </aside>
  );
}
