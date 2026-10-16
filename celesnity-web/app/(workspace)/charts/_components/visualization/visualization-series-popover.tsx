'use client';

import { useState } from 'react';
import { PaletteIcon, SlidersHorizontalIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/app/_components/ui/popover';
import type {
  ColorSettings,
  ValueFormattingSettings,
  VisualizationDefinition,
} from '@/src/entities/models/canonical-chart';

export type VisualizationSeriesTab = 'STYLE' | 'FORMATTING';

export interface VisualizationSeriesPopoverProps {
  readonly series: string;
  readonly definition: VisualizationDefinition;
  readonly onChange: (definition: VisualizationDefinition) => void;
}

type CartesianDefinition = Extract<
  VisualizationDefinition,
  { readonly type: 'BAR' | 'LINE' | 'AREA' | 'SCATTER' }
>;

/** Anchored series menu matching Metabase's Style / Formatting affordance. */
export function VisualizationSeriesPopover({
  series,
  definition,
  onChange,
}: VisualizationSeriesPopoverProps) {
  const [tab, setTab] = useState<VisualizationSeriesTab>('STYLE');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={`${series} series settings`}>
          <SlidersHorizontalIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" aria-label={`${series} series settings`}>
        <PopoverHeader>
          <PopoverTitle>{series}</PopoverTitle>
          <div className="flex border-b border-border" role="tablist" aria-label="Series settings">
            <Button
              type="button"
              variant="ghost"
              role="tab"
              aria-selected={tab === 'STYLE'}
              className={
                tab === 'STYLE' ? 'rounded-none border-b-2 border-primary' : 'rounded-none'
              }
              onClick={() => setTab('STYLE')}
            >
              Style
            </Button>
            <Button
              type="button"
              variant="ghost"
              role="tab"
              aria-selected={tab === 'FORMATTING'}
              className={
                tab === 'FORMATTING' ? 'rounded-none border-b-2 border-primary' : 'rounded-none'
              }
              onClick={() => setTab('FORMATTING')}
            >
              Formatting
            </Button>
          </div>
        </PopoverHeader>
        {tab === 'STYLE' ? (
          <SeriesStyle series={series} definition={definition} onChange={onChange} />
        ) : (
          <SeriesFormatting series={series} definition={definition} onChange={onChange} />
        )}
      </PopoverContent>
    </Popover>
  );
}

/*
 * Only used if `--mchart-1` cannot be read at all. `<input type="color">` needs a
 * literal, so there is no token form available here.
 */
// eslint-disable-next-line no-restricted-syntax -- see above
const FALLBACK_SERIES_COLOR = '#0075de';

/**
 * The first categorical slot, resolved to a literal.
 *
 * `<input type="color">` only accepts a hex, so the palette token has to be read
 * off the document rather than handed through as `var(--mchart-1)`. A picked
 * colour is stored on the chart and is deliberately kept as the literal the user
 * chose; this is only the value the picker opens on when they have not chosen.
 */
function useDefaultSeriesColor(): string {
  // Read once, lazily, on the first client render. This popover's content only
  // mounts when it is opened, so `document` is always present — and a lazy
  // initializer avoids the cascading render that a `setState` in an effect causes.
  const [color] = useState(() => {
    if (typeof document === 'undefined') return FALLBACK_SERIES_COLOR;
    const token = getComputedStyle(document.documentElement).getPropertyValue('--mchart-1').trim();
    return token.startsWith('#') ? token : FALLBACK_SERIES_COLOR;
  });
  return color;
}

function SeriesStyle({ series, definition, onChange }: VisualizationSeriesPopoverProps) {
  const defaultColor = useDefaultSeriesColor();
  if (!isCartesian(definition))
    return <p className="text-body-sm text-muted-foreground">No series settings.</p>;
  const cartesian = definition;
  const color = cartesian.display.colors?.byField?.[series] ?? defaultColor;

  function updateColors(next: ColorSettings): void {
    onChange({ ...cartesian, display: { ...cartesian.display, colors: next } });
  }

  return (
    <div className="mt-3 grid gap-3">
      <label className="grid gap-1 text-body-sm font-medium">
        Color
        <span className="flex items-center gap-2">
          <PaletteIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <Input
            aria-label={`${series} color`}
            type="color"
            className="h-9 w-14 p-1"
            value={color}
            onChange={(event) =>
              updateColors({
                ...cartesian.display.colors,
                byField: { ...cartesian.display.colors?.byField, [series]: event.target.value },
              })
            }
          />
          <span className="text-caption text-muted-foreground">{color}</span>
        </span>
      </label>
      {'orientation' in cartesian.display ? (
        <label className="grid gap-1 text-body-sm font-medium">
          Display type
          <select
            aria-label={`${series} display type`}
            className="h-9 rounded-md border border-input bg-background px-3 text-body-sm"
            value={cartesian.display.orientation ?? 'VERTICAL'}
            onChange={(event) =>
              onChange({
                ...cartesian,
                display: {
                  ...cartesian.display,
                  orientation: event.target.value as 'VERTICAL' | 'HORIZONTAL',
                },
              } as CartesianDefinition)
            }
          >
            <option>VERTICAL</option>
            <option>HORIZONTAL</option>
          </select>
        </label>
      ) : null}
      {'interpolation' in cartesian.display ? (
        <label className="grid gap-1 text-body-sm font-medium">
          Line style
          <select
            aria-label={`${series} line style`}
            className="h-9 rounded-md border border-input bg-background px-3 text-body-sm"
            value={cartesian.display.interpolation ?? 'LINEAR'}
            onChange={(event) =>
              onChange({
                ...cartesian,
                display: {
                  ...cartesian.display,
                  interpolation: event.target.value as 'LINEAR' | 'STEP' | 'SMOOTH',
                },
              } as CartesianDefinition)
            }
          >
            <option>LINEAR</option>
            <option>STEP</option>
            <option>SMOOTH</option>
          </select>
        </label>
      ) : null}
      <p className="text-caption text-muted-foreground">
        Series names and axis roles stay in the canonical definition.
      </p>
    </div>
  );
}

function SeriesFormatting({ series, definition, onChange }: VisualizationSeriesPopoverProps) {
  if (!isCartesian(definition))
    return <p className="text-body-sm text-muted-foreground">No series formatting.</p>;
  const cartesian = definition;
  const formatting = cartesian.display.valueFormatting;
  function update(valueFormatting: ValueFormattingSettings): void {
    onChange({ ...cartesian, display: { ...cartesian.display, valueFormatting } });
  }
  return (
    <div className="mt-3 grid gap-3">
      <label className="grid gap-1 text-body-sm font-medium">
        Number of decimal places
        <Input
          aria-label={`${series} decimal places`}
          type="number"
          min={0}
          max={10}
          value={formatting?.decimalPlaces ?? ''}
          onChange={(event) =>
            update({
              ...formatting,
              decimalPlaces: event.target.value === '' ? undefined : Number(event.target.value),
            })
          }
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-body-sm font-medium">
          Prefix
          <Input
            aria-label={`${series} prefix`}
            value={formatting?.prefix ?? ''}
            onChange={(event) => update({ ...formatting, prefix: event.target.value || undefined })}
          />
        </label>
        <label className="grid gap-1 text-body-sm font-medium">
          Suffix
          <Input
            aria-label={`${series} suffix`}
            value={formatting?.suffix ?? ''}
            onChange={(event) => update({ ...formatting, suffix: event.target.value || undefined })}
          />
        </label>
      </div>
      <label className="flex items-center justify-between gap-3 text-body-sm font-medium">
        Compact notation
        <input
          type="checkbox"
          role="switch"
          aria-label={`${series} compact notation`}
          checked={formatting?.compact ?? false}
          onChange={(event) => update({ ...formatting, compact: event.target.checked })}
        />
      </label>
    </div>
  );
}

function isCartesian(definition: VisualizationDefinition): definition is CartesianDefinition {
  return (
    definition.type === 'BAR' ||
    definition.type === 'LINE' ||
    definition.type === 'AREA' ||
    definition.type === 'SCATTER'
  );
}
