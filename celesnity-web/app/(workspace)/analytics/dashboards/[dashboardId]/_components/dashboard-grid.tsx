'use client';

import { useRef, useState } from 'react';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CopyIcon,
  GripVerticalIcon,
  Maximize2Icon,
  MoreHorizontalIcon,
  Trash2Icon,
} from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { Input } from '@/app/_components/ui/input';
import type { DashboardCard, DashboardGeometry } from '@/src/entities/models/dashboard';

const COLUMN_COUNT = 24;
const ROW_HEIGHT = 40;
const GUTTER = 6;

export function DashboardGrid({
  cards,
  onChange,
  onRemove,
  onDuplicate,
  renderChart,
  children,
}: {
  readonly cards: readonly DashboardCard[];
  readonly onChange: (card: DashboardCard) => void;
  readonly onRemove: (cardId: string) => void;
  readonly onDuplicate?: (card: DashboardCard) => void;
  readonly renderChart?: (card: Extract<DashboardCard, { kind: 'CHART' }>) => React.ReactNode;
  readonly children?: React.ReactNode;
}) {
  const gridRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={gridRef}
      className="grid min-h-144 grid-cols-1 gap-1.5 py-4 md:auto-rows-[2.5rem] md:grid-cols-24"
      aria-label="Dashboard grid"
    >
      {cards.map((card) => (
        <EditableDashboardCard
          key={card.id}
          card={card}
          gridRef={gridRef}
          onChange={onChange}
          onRemove={() => onRemove(card.id)}
          onDuplicate={onDuplicate ? () => onDuplicate(card) : undefined}
          renderChart={renderChart}
        />
      ))}
      {children}
    </section>
  );
}

function EditableDashboardCard({
  card,
  gridRef,
  onChange,
  onRemove,
  onDuplicate,
  renderChart,
}: {
  readonly card: DashboardCard;
  readonly gridRef: React.RefObject<HTMLElement | null>;
  readonly onChange: (card: DashboardCard) => void;
  readonly onRemove: () => void;
  readonly onDuplicate?: () => void;
  readonly renderChart?: (card: Extract<DashboardCard, { kind: 'CHART' }>) => React.ReactNode;
}) {
  const [pointerOperation, setPointerOperation] = useState<{
    readonly kind: 'MOVE' | 'RESIZE';
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly geometry: DashboardGeometry;
  } | null>(null);

  function startPointerOperation(
    event: React.PointerEvent<HTMLButtonElement>,
    kind: 'MOVE' | 'RESIZE',
  ): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    setPointerOperation({
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      geometry: card.geometry,
    });
  }

  function updateFromPointer(event: React.PointerEvent<HTMLButtonElement>): void {
    if (!pointerOperation || pointerOperation.pointerId !== event.pointerId) return;
    const width = gridRef.current?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    const columnWidth = (width - GUTTER * (COLUMN_COUNT - 1)) / COLUMN_COUNT;
    const deltaX = Math.round((event.clientX - pointerOperation.startX) / (columnWidth + GUTTER));
    const deltaY = Math.round((event.clientY - pointerOperation.startY) / (ROW_HEIGHT + GUTTER));
    const geometry =
      pointerOperation.kind === 'MOVE'
        ? moveDashboardGeometry(pointerOperation.geometry, deltaX, deltaY)
        : resizeDashboardGeometry(pointerOperation.geometry, deltaX, deltaY);
    onChange({ ...card, geometry });
  }

  return (
    <article
      style={dashboardGridStyle(card.geometry)}
      className="group relative min-h-32 rounded-lg border border-border bg-card p-4 [grid-column:1/-1] md:min-h-0 md:[grid-column:var(--dashboard-column)] md:[grid-row:var(--dashboard-row)]"
    >
      <div className="absolute top-1 right-1 z-10 flex rounded-md bg-card/95 opacity-0 shadow-sm group-focus-within:opacity-100 group-hover:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Move card"
          className="cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={(event) => startPointerOperation(event, 'MOVE')}
          onPointerMove={updateFromPointer}
          onPointerUp={() => setPointerOperation(null)}
          onPointerCancel={() => setPointerOperation(null)}
          onKeyDown={(event) => handleMoveKey(event, card, onChange)}
        >
          <GripVerticalIcon aria-hidden="true" />
        </Button>
        <CardGeometryMenu
          card={card}
          onChange={onChange}
          onRemove={onRemove}
          onDuplicate={onDuplicate}
        />
      </div>

      {card.kind === 'HEADING' ? (
        <Input
          aria-label="Heading text"
          value={card.content.text}
          onChange={(event) => onChange({ ...card, content: { text: event.target.value } })}
          className="border-0 px-0 text-title shadow-none"
        />
      ) : card.kind === 'TEXT' ? (
        <textarea
          aria-label="Text content"
          value={card.content.markdown}
          onChange={(event) => onChange({ ...card, content: { markdown: event.target.value } })}
          className="min-h-24 w-full resize-none bg-transparent text-body-sm outline-none"
        />
      ) : card.kind === 'LINK' ? (
        <div className="grid gap-2">
          <Input
            aria-label="Link label"
            value={card.content.label}
            onChange={(event) =>
              onChange({ ...card, content: { ...card.content, label: event.target.value } })
            }
          />
          <Input
            aria-label="Link URL"
            value={card.content.url}
            onChange={(event) =>
              onChange({ ...card, content: { ...card.content, url: event.target.value } })
            }
          />
        </div>
      ) : (
        <div className="h-full w-full min-w-0">
          {renderChart ? renderChart(card) : <p className="font-medium">Chart · {card.chartId}</p>}
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Resize card"
        className="absolute right-0 bottom-0 cursor-nwse-resize touch-none opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        onPointerDown={(event) => startPointerOperation(event, 'RESIZE')}
        onPointerMove={updateFromPointer}
        onPointerUp={() => setPointerOperation(null)}
        onPointerCancel={() => setPointerOperation(null)}
        onKeyDown={(event) => handleResizeKey(event, card, onChange)}
      >
        <Maximize2Icon aria-hidden="true" className="size-3" />
      </Button>
    </article>
  );
}

function CardGeometryMenu({
  card,
  onChange,
  onRemove,
  onDuplicate,
}: {
  readonly card: DashboardCard;
  readonly onChange: (card: DashboardCard) => void;
  readonly onRemove: () => void;
  readonly onDuplicate?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Card layout options">
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => changeGeometry(card, -1, 0, 'MOVE', onChange)}>
          <ArrowLeftIcon aria-hidden="true" /> Move left
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => changeGeometry(card, 1, 0, 'MOVE', onChange)}>
          <ArrowRightIcon aria-hidden="true" /> Move right
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => changeGeometry(card, 0, -1, 'MOVE', onChange)}>
          <ArrowUpIcon aria-hidden="true" /> Move up
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => changeGeometry(card, 0, 1, 'MOVE', onChange)}>
          <ArrowDownIcon aria-hidden="true" /> Move down
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => changeGeometry(card, -1, 0, 'RESIZE', onChange)}>
          Make narrower
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => changeGeometry(card, 1, 0, 'RESIZE', onChange)}>
          Make wider
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => changeGeometry(card, 0, -1, 'RESIZE', onChange)}>
          Make shorter
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => changeGeometry(card, 0, 1, 'RESIZE', onChange)}>
          Make taller
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {onDuplicate ? (
          <DropdownMenuItem onSelect={onDuplicate}>
            <CopyIcon aria-hidden="true" /> Duplicate
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2Icon aria-hidden="true" /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function changeGeometry(
  card: DashboardCard,
  deltaX: number,
  deltaY: number,
  operation: 'MOVE' | 'RESIZE',
  onChange: (card: DashboardCard) => void,
): void {
  onChange({
    ...card,
    geometry:
      operation === 'MOVE'
        ? moveDashboardGeometry(card.geometry, deltaX, deltaY)
        : resizeDashboardGeometry(card.geometry, deltaX, deltaY),
  });
}

function handleMoveKey(
  event: React.KeyboardEvent,
  card: DashboardCard,
  onChange: (card: DashboardCard) => void,
): void {
  const delta = arrowDelta(event.key);
  if (!delta) return;
  event.preventDefault();
  changeGeometry(card, delta[0], delta[1], 'MOVE', onChange);
}

function handleResizeKey(
  event: React.KeyboardEvent,
  card: DashboardCard,
  onChange: (card: DashboardCard) => void,
): void {
  const delta = arrowDelta(event.key);
  if (!delta) return;
  event.preventDefault();
  changeGeometry(card, delta[0], delta[1], 'RESIZE', onChange);
}

function arrowDelta(key: string): readonly [number, number] | null {
  if (key === 'ArrowLeft') return [-1, 0];
  if (key === 'ArrowRight') return [1, 0];
  if (key === 'ArrowUp') return [0, -1];
  if (key === 'ArrowDown') return [0, 1];
  return null;
}

export function moveDashboardGeometry(
  geometry: DashboardGeometry,
  deltaX: number,
  deltaY: number,
): DashboardGeometry {
  return constrainDashboardGeometry({
    ...geometry,
    x: geometry.x + deltaX,
    y: geometry.y + deltaY,
  });
}

export function resizeDashboardGeometry(
  geometry: DashboardGeometry,
  deltaWidth: number,
  deltaHeight: number,
): DashboardGeometry {
  return constrainDashboardGeometry({
    ...geometry,
    width: geometry.width + deltaWidth,
    height: geometry.height + deltaHeight,
  });
}

export function constrainDashboardGeometry(geometry: DashboardGeometry): DashboardGeometry {
  const width = Math.min(COLUMN_COUNT, Math.max(1, geometry.width));
  const x = Math.min(COLUMN_COUNT - width, Math.max(0, geometry.x));
  return {
    x,
    y: Math.max(0, geometry.y),
    width,
    height: Math.max(1, geometry.height),
  };
}

export function dashboardGridStyle(geometry: DashboardGeometry): React.CSSProperties {
  return {
    '--dashboard-column': `${geometry.x + 1} / span ${geometry.width}`,
    '--dashboard-row': `${geometry.y + 1} / span ${geometry.height}`,
  } as React.CSSProperties;
}
