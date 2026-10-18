'use client';

import { ArrowRightIcon, CircleHelpIcon, TriangleAlertIcon } from 'lucide-react';
import { useMemo } from 'react';

import { useTranslation } from '@/app/_i18n/use-translation';
import type { TranslationKey } from '@/app/_i18n/en';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import type { PlantNode } from '@/src/entities/models/plant-model';
import {
  PROPERTY,
  VISIBLE_STATES,
  type Evidence,
  type ExtractedTwin,
  type VisibleState,
} from '@/src/entities/models/plant-walkthrough';
import { formatTimestamp, splitTimestamps } from '@/src/entities/models/video-timestamp';

import { TwinView } from './twin-view';
import { useEvidenceFrames } from './use-evidence-frames';
import {
  STATE_LABEL,
  STATE_TONE,
} from '@/app/(workspace)/plant-model/_components/twin/twin-labels';

interface Group {
  readonly id: string;
  readonly title: string;
  readonly caption?: string;
  readonly items: readonly PlantNode[];
  readonly isLine: boolean;
}

interface WalkthroughResultsProps {
  readonly twin: ExtractedTwin;
  readonly videoUrl?: string;
  readonly onSeek: (seconds: number) => void;
}

export function WalkthroughResults({ twin, videoUrl, onSeek }: WalkthroughResultsProps) {
  const { t } = useTranslation();
  const { groups, counts } = useMemo(() => groupTwin(twin), [twin]);
  const times = useMemo(
    () =>
      groups.flatMap((group) => group.items).map((item) => twin.evidence[item.id]?.[0]?.tSec ?? 0),
    [groups, twin],
  );
  const frames = useEvidenceFrames(videoUrl, times);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h2 className="text-heading-2">{twin.siteName}</h2>
        {twin.summary !== '' && (
          <p className="text-body-md text-muted-foreground">{twin.summary}</p>
        )}
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          {counts.map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <dt className="text-label text-muted-foreground">{t(label)}</dt>
              <dd className="text-title tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <Tabs defaultValue="twin" className="gap-4">
        <TabsList>
          <TabsTrigger value="twin">{t('plantWalkthrough.tab.twin')}</TabsTrigger>
          <TabsTrigger value="list">{t('plantWalkthrough.tab.list')}</TabsTrigger>
        </TabsList>
        <TabsContent value="twin">
          <TwinView twin={twin} frames={frames} onSeek={onSeek} />
        </TabsContent>
        <TabsContent value="list" className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.id} className="flex flex-col gap-3" aria-label={group.title}>
              <div className="flex items-baseline gap-2">
                <h3 className="text-heading-3">
                  {group.isLine
                    ? group.title
                    : group.title === ''
                      ? t('plantWalkthrough.elsewhere')
                      : t('plantWalkthrough.outsideLine', { area: group.title })}
                </h3>
                {group.caption !== undefined && (
                  <span className="text-body-sm text-muted-foreground">{group.caption}</span>
                )}
              </div>
              <ol className="flex flex-wrap items-stretch gap-y-3">
                {group.items.map((item, index) => {
                  const previous = group.items[index - 1];
                  const incoming =
                    group.isLine && previous !== undefined
                      ? twin.flows[`route-${previous.id}-${item.id}`]
                      : undefined;
                  const first = twin.evidence[item.id]?.[0];
                  return (
                    <li key={item.id} className="flex items-stretch">
                      {incoming !== undefined ? (
                        <div className="flex w-24 flex-col items-center gap-1 self-center px-2 text-center text-micro text-muted-foreground">
                          <ArrowRightIcon className="size-4" aria-hidden />
                          <span className="line-clamp-2">
                            {incoming.material}
                            {incoming.inferred && ` (${t('plantWalkthrough.assumed')})`}
                          </span>
                        </div>
                      ) : (
                        previous !== undefined && <div className="w-3" aria-hidden />
                      )}
                      <EquipmentCard
                        node={item}
                        evidence={first}
                        frame={first === undefined ? undefined : frames.get(first.tSec)}
                        onSeek={onSeek}
                      />
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </TabsContent>
      </Tabs>

      {twin.openQuestions.length > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h3 className="flex items-center gap-2 text-title">
            <CircleHelpIcon className="size-4.5 text-status-info" aria-hidden />
            {t('plantWalkthrough.questions')}
          </h3>
          <ul className="flex flex-col gap-2 text-body-md">
            {twin.openQuestions.map((question) => (
              <li key={question}>
                {splitTimestamps(question).map((part, index) =>
                  'seconds' in part ? (
                    <Button
                      key={index}
                      variant="link"
                      className="h-auto p-0 align-baseline tabular-nums"
                      onClick={() => onSeek(part.seconds)}
                    >
                      {part.label}
                    </Button>
                  ) : (
                    <span key={index}>{part.text}</span>
                  ),
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {twin.warnings.length > 0 && (
        <section className="flex flex-col gap-2 text-body-sm text-muted-foreground">
          <h3 className="flex items-center gap-2 text-label">
            <TriangleAlertIcon className="size-4 text-status-warning" aria-hidden />
            {t('plantWalkthrough.warnings')}
          </h3>
          <ul className="list-disc pl-5">
            {twin.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <details className="rounded-lg border p-4 text-body-sm">
        <summary className="cursor-pointer text-label">{t('plantWalkthrough.json')}</summary>
        <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-micro">
          {JSON.stringify(twin.draft, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function EquipmentCard({
  node,
  evidence,
  frame,
  onSeek,
}: {
  readonly node: PlantNode;
  readonly evidence?: Evidence;
  readonly frame?: string;
  readonly onSeek: (seconds: number) => void;
}) {
  const { t } = useTranslation();
  const raw = node.values[PROPERTY.visibleState];
  const state: VisibleState = VISIBLE_STATES.find((value) => value === raw) ?? 'unknown';
  const type = String(node.values[PROPERTY.equipmentType] ?? '');
  return (
    <article className="flex w-52 flex-col overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        disabled={evidence === undefined}
        onClick={() => evidence !== undefined && onSeek(evidence.tSec)}
        className="relative block aspect-video w-full overflow-hidden bg-muted text-left"
        aria-label={
          evidence === undefined
            ? undefined
            : t('plantWalkthrough.panel.play', { time: formatTimestamp(evidence.tSec) })
        }
      >
        {frame !== undefined && (
          // A still captured in the browser from the user's own video.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={frame} alt="" className="size-full object-cover" />
        )}
        {evidence !== undefined && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-foreground/75 px-1.5 py-0.5 text-micro font-medium text-background tabular-nums">
            {formatTimestamp(evidence.tSec)}
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-label">{node.name}</h4>
          <Badge variant={STATE_TONE[state]}>{t(STATE_LABEL[state])}</Badge>
        </div>
        {type !== '' && <p className="text-body-sm text-muted-foreground">{type}</p>}
        {evidence !== undefined && (
          <p className="text-micro text-muted-foreground">
            {evidence.note}
            {evidence.confidence < 0.5 && (
              <span className="text-status-warning-dark">
                {' · '}
                {t('plantWalkthrough.lowConfidence')}
              </span>
            )}
          </p>
        )}
      </div>
    </article>
  );
}

function groupTwin(twin: ExtractedTwin): {
  groups: Group[];
  counts: [TranslationKey, number][];
} {
  const byId = new Map(twin.draft.nodes.map((node) => [node.id, node]));
  const parentOf = new Map(
    twin.draft.relationships
      .filter((value) => value.kind === 'contains')
      .map((value) => [value.targetNodeId, value.sourceNodeId]),
  );
  const isContainer = (node: PlantNode) =>
    node.nodeTypeId === 'type-area' || node.nodeTypeId === 'type-line';
  const equipment = twin.draft.nodes.filter((node) => !isContainer(node));
  const lines = twin.draft.nodes.filter((node) => node.nodeTypeId === 'type-line');
  const byX = (a: PlantNode, b: PlantNode) => a.position.x - b.position.x;

  const groups: Group[] = lines
    .map((line) => ({
      id: line.id,
      title: line.name,
      caption: byId.get(parentOf.get(line.id) ?? '')?.name,
      items: equipment.filter((item) => parentOf.get(item.id) === line.id).sort(byX),
      isLine: true,
    }))
    .filter((group) => group.items.length > 0);

  // Equipment outside a line is grouped by its area; the title is the area's
  // name, or empty for equipment in no area.
  const byArea = new Map<string, PlantNode[]>();
  for (const item of equipment) {
    if (byId.get(parentOf.get(item.id) ?? '')?.nodeTypeId === 'type-line') continue;
    const area = parentOf.get(item.id) ?? '';
    byArea.set(area, [...(byArea.get(area) ?? []), item]);
  }
  for (const [area, items] of byArea) {
    groups.push({
      id: `loose-${area || 'none'}`,
      title: area === '' ? '' : (byId.get(area)?.name ?? area),
      items: items.sort(byX),
      isLine: false,
    });
  }

  // Same order as the walk: the layout puts rows the camera reached first at the top.
  const rowY = (group: Group) => Math.min(...group.items.map((item) => item.position.y));
  groups.sort((a, b) => rowY(a) - rowY(b));

  return {
    groups,
    counts: [
      [
        'plantWalkthrough.count.areas',
        twin.draft.nodes.filter((node) => node.nodeTypeId === 'type-area').length,
      ],
      ['plantWalkthrough.count.lines', lines.length],
      ['plantWalkthrough.count.equipment', equipment.length],
      [
        'plantWalkthrough.count.flows',
        twin.draft.relationships.filter((value) => value.kind === 'routes-to').length,
      ],
      ['plantWalkthrough.count.questions', twin.openQuestions.length],
    ],
  };
}
