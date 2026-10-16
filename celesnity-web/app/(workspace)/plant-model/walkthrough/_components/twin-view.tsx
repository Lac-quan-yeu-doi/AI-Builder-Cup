'use client';

import { ArrowDownLeftIcon, ArrowUpRightIcon, PlayIcon, XIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState } from 'react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { buildTwinScene, type TwinMachine } from '@/src/entities/models/plant-twin-scene';
import type { ExtractedTwin } from '@/src/entities/models/plant-walkthrough';
import { formatTimestamp } from '@/src/entities/models/video-timestamp';

import { KIND_LABEL, STATE_DOT, STATE_LABEL, STATE_TONE } from './walkthrough-labels';

// WebGL needs a browser; the server renders a placeholder of the same size.
const TwinCanvas = dynamic(() => import('./twin-canvas').then((module) => module.TwinCanvas), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

interface TwinViewProps {
  readonly twin: ExtractedTwin;
  readonly frames: ReadonlyMap<number, string>;
  readonly onSeek: (seconds: number) => void;
}

export function TwinView({ twin, frames, onSeek }: TwinViewProps) {
  const { t } = useTranslation();
  const scene = useMemo(() => buildTwinScene(twin), [twin]);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = scene.machines.find((machine) => machine.id === selectedId);
  const names = useMemo(
    () => new Map(scene.machines.map((machine) => [machine.id, machine.name])),
    [scene.machines],
  );
  const labels = useRef(new Map<string, HTMLElement>());
  const label = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element === null) labels.current.delete(id);
      else labels.current.set(id, element);
    },
    [],
  );

  return (
    <div className="relative h-[560px] overflow-hidden rounded-xl border bg-muted/40">
      <TwinCanvas scene={scene} selectedId={selectedId} onSelect={setSelectedId} labels={labels} />

      {/* Positioned by the canvas every frame; hidden until the first frame places them. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {scene.machines.map((machine) => (
          <span
            key={machine.id}
            ref={label(machine.id)}
            style={{ visibility: 'hidden' }}
            className="absolute top-0 left-0 will-change-transform"
          >
            <span
              className={
                machine.id === selectedId
                  ? 'block max-w-32 -translate-x-1/2 -translate-y-full truncate rounded-md border border-transparent bg-status-info px-1.5 py-0.5 text-micro font-medium whitespace-nowrap text-primary-foreground shadow-sm'
                  : `block max-w-32 -translate-x-1/2 -translate-y-full truncate rounded-md border bg-card px-1.5 py-0.5 text-micro font-medium whitespace-nowrap shadow-sm transition-opacity ${
                      selectedId === undefined ? '' : 'opacity-40'
                    }`
              }
            >
              {machine.name}
            </span>
          </span>
        ))}
        {scene.zones
          .filter((zone) => zone.kind === 'area')
          .map((zone) => (
            <span
              key={zone.id}
              ref={label(zone.id)}
              style={{ visibility: 'hidden' }}
              className="absolute top-0 left-0 will-change-transform"
            >
              <span className="block -translate-x-[calc(100%+10px)] translate-y-1 rounded bg-background/90 px-1.5 py-0.5 text-micro font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                {zone.name}
              </span>
            </span>
          ))}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-lg bg-card/90 px-3 py-2 text-micro text-muted-foreground shadow-sm">
        <div className="flex gap-3">
          {(['running', 'idle', 'stopped', 'unknown'] as const).map((state) => (
            <span key={state} className="flex items-center gap-1">
              <span className={`size-2 rounded-full ${STATE_DOT[state]}`} aria-hidden />
              {t(STATE_LABEL[state])}
            </span>
          ))}
        </div>
        <div className="flex gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-5 bg-foreground/60" aria-hidden />
            {t('plantWalkthrough.legend.seen')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-5 border-t-2 border-dashed border-foreground/60" aria-hidden />
            {t('plantWalkthrough.legend.assumed')}
          </span>
        </div>
      </div>
      <p className="pointer-events-none absolute right-3 bottom-3 text-micro text-muted-foreground">
        {t('plantWalkthrough.hint')}
      </p>

      {selected !== undefined && (
        <MachinePanel
          key={selected.id}
          machine={selected}
          twin={twin}
          frames={frames}
          names={names}
          onSeek={onSeek}
          onClose={() => setSelectedId(undefined)}
          onSelect={setSelectedId}
        />
      )}
    </div>
  );
}

function MachinePanel({
  machine,
  twin,
  frames,
  names,
  onSeek,
  onClose,
  onSelect,
}: {
  readonly machine: TwinMachine;
  readonly twin: ExtractedTwin;
  readonly frames: ReadonlyMap<number, string>;
  readonly names: ReadonlyMap<string, string>;
  readonly onSeek: (seconds: number) => void;
  readonly onClose: () => void;
  readonly onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const evidence = twin.evidence[machine.id] ?? [];
  const first = evidence[0];
  const frame = first === undefined ? undefined : frames.get(first.tSec);
  const routes = twin.draft.relationships.filter((value) => value.kind === 'routes-to');
  const flows = [
    ...routes
      .filter((route) => route.targetNodeId === machine.id)
      .map((route) => ({ route, other: route.sourceNodeId, incoming: true })),
    ...routes
      .filter((route) => route.sourceNodeId === machine.id)
      .map((route) => ({ route, other: route.targetNodeId, incoming: false })),
  ];

  return (
    <aside
      className="absolute top-3 right-3 flex max-h-[calc(100%-1.5rem)] w-72 flex-col overflow-hidden rounded-xl border bg-card shadow-300"
      aria-label={machine.name}
    >
      {frame !== undefined && (
        // A still captured in the browser from the user's own video.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frame} alt="" className="aspect-video w-full shrink-0 object-cover" />
      )}
      <div className="flex flex-col gap-3 overflow-y-auto p-4">
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
          <Badge variant={STATE_TONE[machine.state]}>
            {t('plantWalkthrough.stateInVideo', { state: t(STATE_LABEL[machine.state]) })}
          </Badge>
          <Badge variant="outline">{t(KIND_LABEL[machine.kind])}</Badge>
        </div>

        {evidence.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h4 className="text-label text-muted-foreground">
              {t('plantWalkthrough.panel.seenIn')}
            </h4>
            <ul className="flex flex-col gap-1.5">
              {evidence.map((item) => (
                <li
                  key={`${item.tSec}-${item.note}`}
                  className="flex items-start gap-2 text-body-sm"
                >
                  <Button
                    variant="secondary"
                    size="xs"
                    className="tabular-nums"
                    aria-label={t('plantWalkthrough.panel.play', {
                      time: formatTimestamp(item.tSec),
                    })}
                    onClick={() => onSeek(item.tSec)}
                  >
                    <PlayIcon />
                    {formatTimestamp(item.tSec)}
                  </Button>
                  <span>
                    {item.note}
                    {item.confidence < 0.5 && (
                      <span className="text-status-warning-dark">
                        {' '}
                        ({t('plantWalkthrough.lowConfidence')})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {flows.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h4 className="text-label text-muted-foreground">{t('plantWalkthrough.panel.flow')}</h4>
            <ul className="flex flex-col gap-1 text-body-sm">
              {flows.map(({ route, other, incoming }) => {
                const detail = twin.flows[route.id];
                const Icon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
                const name = names.get(other) ?? other;
                return (
                  <li key={route.id} className="flex items-start gap-1.5">
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span>
                      <Button
                        variant="link"
                        size="xs"
                        className="h-auto p-0"
                        onClick={() => onSelect(other)}
                      >
                        {incoming
                          ? t('plantWalkthrough.panel.from', { name })
                          : t('plantWalkthrough.panel.to', { name })}
                      </Button>
                      {detail !== undefined && (
                        <span className="text-muted-foreground">
                          {' · '}
                          {detail.material},{' '}
                          {detail.inferred
                            ? t('plantWalkthrough.assumed')
                            : t('plantWalkthrough.seen')}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
