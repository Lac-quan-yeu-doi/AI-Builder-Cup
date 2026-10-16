'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CheckIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/app/_components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import type {
  AxisSettings,
  OutputColumn,
  VisualizationDefinition,
} from '@/src/entities/models/canonical-chart';

import { NotebookEditorProvider } from '../notebook/notebook-editor-context';
import { VisualizationDataPanel } from './visualization-data-panel';
import { VisualizationDisplayPanel } from './visualization-display-panel';
import { VisualizationSeriesPopover } from './visualization-series-popover';

export type VisualizationSettingsTab = 'DATA' | 'DISPLAY' | 'AXES';

export interface VisualizationSettingsPanelProps {
  readonly open: boolean;
  readonly activeTab?: VisualizationSettingsTab;
  readonly definition: VisualizationDefinition;
  readonly fields: readonly OutputColumn[];
  readonly onTabChange?: (tab: VisualizationSettingsTab) => void;
  readonly onClose: () => void;
  readonly onChange: (definition: VisualizationDefinition) => void;
  /** The chart-type row, pinned above the tabs. */
  readonly typePicker?: ReactNode;
}

/** Metabase-like left settings panel. Unsupported tabs contain no invalid role controls. */
export function VisualizationSettingsPanel({
  open,
  activeTab: requestedTab,
  definition,
  fields,
  onTabChange,
  onClose,
  onChange,
  typePicker,
}: VisualizationSettingsPanelProps) {
  const [tab, setTab] = useState<VisualizationSettingsTab>(requestedTab ?? 'DATA');
  const activeTab = requestedTab ?? tab;
  const narrow = useNarrowViewport();

  if (!open) return null;

  function changeTab(nextTab: VisualizationSettingsTab): void {
    setTab(nextTab);
    onTabChange?.(nextTab);
  }

  const supportsAxes =
    definition.type === 'BAR' ||
    definition.type === 'LINE' ||
    definition.type === 'AREA' ||
    definition.type === 'SCATTER';

  const body = (
    <SettingsPanelBody
      activeTab={activeTab}
      definition={definition}
      fields={fields}
      supportsAxes={supportsAxes}
      onTabChange={changeTab}
      onClose={onClose}
      onChange={onChange}
      typePicker={typePicker}
    />
  );

  return (
    <NotebookEditorProvider>
      {narrow ? (
        <Sheet open onOpenChange={(nextOpen) => !nextOpen && onClose()}>
          <SheetContent
            side="left"
            className="flex h-full w-[min(92vw,24rem)] max-w-none flex-col gap-0 p-0"
            aria-label="Visualization settings"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Visualization settings</SheetTitle>
            </SheetHeader>
            {body}
          </SheetContent>
        </Sheet>
      ) : (
        <aside
          className="flex h-[min(65vh,32rem)] min-h-0 w-full shrink-0 flex-col border-b border-border bg-card lg:h-full lg:w-96 lg:border-r lg:border-b-0"
          aria-label="Visualization settings"
          role="region"
        >
          {body}
        </aside>
      )}
    </NotebookEditorProvider>
  );
}

function SettingsPanelBody({
  activeTab,
  definition,
  fields,
  supportsAxes,
  onTabChange,
  onClose,
  onChange,
  typePicker,
}: {
  readonly activeTab: VisualizationSettingsTab;
  readonly definition: VisualizationDefinition;
  readonly fields: readonly OutputColumn[];
  readonly supportsAxes: boolean;
  readonly onTabChange: (tab: VisualizationSettingsTab) => void;
  readonly onClose: () => void;
  readonly onChange: (definition: VisualizationDefinition) => void;
  readonly typePicker?: ReactNode;
}) {
  // Axes has always existed for every chart type and rendered nothing for four
  // of the seven. A tab that is empty half the time is a tab you learn to
  // distrust, so it is absent instead.
  const tabs: readonly VisualizationSettingsTab[] = supportsAxes
    ? ['DATA', 'DISPLAY', 'AXES']
    : ['DATA', 'DISPLAY'];
  const selected = tabs.includes(activeTab) ? activeTab : 'DATA';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {typePicker ? (
        <div className="shrink-0 space-y-2 border-b border-border p-3">
          <p className="text-caption font-medium text-muted-foreground uppercase">Chart type</p>
          {typePicker}
        </div>
      ) : null}
      <Tabs
        value={selected}
        onValueChange={(value) => onTabChange(value as VisualizationSettingsTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 p-3 pb-0">
          <TabsList className="w-full" aria-label="Visualization settings tabs">
            {tabs.map((item) => (
              <TabsTrigger key={item} value={item}>
                {item === 'DATA' ? 'Data' : item === 'DISPLAY' ? 'Display' : 'Axes'}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <TabsContent value="DATA" className="space-y-4">
            <VisualizationDataPanel definition={definition} fields={fields} onChange={onChange} />
            <SeriesSettings definition={definition} onChange={onChange} />
          </TabsContent>
          <TabsContent value="DISPLAY">
            <VisualizationDisplayPanel definition={definition} onChange={onChange} />
          </TabsContent>
          {supportsAxes ? (
            <TabsContent value="AXES">
              <AxesPanel definition={definition} onChange={onChange} />
            </TabsContent>
          ) : null}
        </div>
      </Tabs>
      <div className="shrink-0 border-t border-border p-3">
        {/* Outline, not the near-black CTA: hiding a panel is not the same kind
            of act as saving a chart, and only one of them should look like it. */}
        <Button type="button" variant="outline" className="h-10 w-full" onClick={onClose}>
          <CheckIcon aria-hidden="true" /> Done
        </Button>
      </div>
    </div>
  );
}

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return narrow;
}

function SeriesSettings({
  definition,
  onChange,
}: {
  readonly definition: VisualizationDefinition;
  readonly onChange: (definition: VisualizationDefinition) => void;
}) {
  const series =
    definition.type === 'BAR'
      ? definition.roles.measures
      : definition.type === 'LINE' || definition.type === 'AREA'
        ? definition.roles.measures
        : definition.type === 'SCATTER'
          ? [definition.roles.y].filter(Boolean)
          : [];
  if (!series.length) return null;
  return (
    <section className="space-y-2 rounded-md border border-border p-3" aria-label="Series settings">
      <h3 className="text-caption font-semibold uppercase">Series</h3>
      {series.map((item) => (
        <div key={item} className="flex items-center justify-between gap-2 text-body-sm">
          <span className="min-w-0 truncate">{item}</span>
          <VisualizationSeriesPopover series={item} definition={definition} onChange={onChange} />
        </div>
      ))}
    </section>
  );
}

function AxesPanel({
  definition,
  onChange,
}: {
  readonly definition: VisualizationDefinition;
  readonly onChange: (definition: VisualizationDefinition) => void;
}) {
  if (
    definition.type !== 'BAR' &&
    definition.type !== 'LINE' &&
    definition.type !== 'AREA' &&
    definition.type !== 'SCATTER'
  ) {
    return null;
  }

  const updateAxis = (axis: 'x' | 'y', value: AxisSettings): void => {
    onChange({
      ...definition,
      display: { ...definition.display, axes: { ...definition.display.axes, [axis]: value } },
    });
  };

  return (
    <div className="space-y-4" aria-label="Axes settings">
      <AxisGroup
        label="X-axis"
        value={definition.display.axes?.x}
        onChange={(value) => updateAxis('x', value)}
      />
      <AxisGroup
        label="Y-axis"
        value={definition.display.axes?.y}
        onChange={(value) => updateAxis('y', value)}
      />
    </div>
  );
}

function AxisGroup({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value?: AxisSettings;
  readonly onChange: (value: AxisSettings) => void;
}) {
  return (
    <fieldset
      className="space-y-3 rounded-md border border-border p-3"
      role="group"
      aria-label={label}
    >
      <legend className="rounded bg-accent px-2 py-1 text-caption font-semibold">{label}</legend>
      <label className="grid gap-1 text-caption font-medium">
        Show label
        <input
          type="checkbox"
          role="switch"
          aria-label={`${label} show label`}
          checked={value?.visible ?? true}
          onChange={(event) => onChange({ ...value, visible: event.target.checked })}
        />
      </label>
      <label className="grid gap-1 text-caption font-medium">
        Label
        <Input
          aria-label={`${label} label`}
          value={value?.title ?? ''}
          onChange={(event) => onChange({ ...value, title: event.target.value || undefined })}
        />
      </label>
      <label className="grid gap-1 text-caption font-medium">
        Show lines and tick marks
        <select
          aria-label={`${label} lines and tick marks`}
          className="h-9 rounded-md border border-input bg-background px-3 text-body-sm"
          value={value?.gridlines === false ? 'HIDE' : 'SHOW'}
          onChange={(event) => onChange({ ...value, gridlines: event.target.value === 'SHOW' })}
        >
          <option value="SHOW">Show</option>
          <option value="HIDE">Hide</option>
        </select>
      </label>
      <label className="grid gap-1 text-caption font-medium">
        Scale
        <select
          aria-label={`${label} scale`}
          className="h-9 rounded-md border border-input bg-background px-3 text-body-sm"
          value={value?.scale ?? 'LINEAR'}
          onChange={(event) =>
            onChange({ ...value, scale: event.target.value as AxisSettings['scale'] })
          }
        >
          <option>LINEAR</option>
          <option>LOG</option>
          <option>POW</option>
        </select>
      </label>
      <label className="grid gap-1 text-caption font-medium">
        Minimum
        <Input
          aria-label={`${label} minimum`}
          type="number"
          value={value?.min ?? ''}
          onChange={(event) =>
            onChange({
              ...value,
              min: event.target.value === '' ? undefined : Number(event.target.value),
            })
          }
        />
      </label>
      <label className="grid gap-1 text-caption font-medium">
        Maximum
        <Input
          aria-label={`${label} maximum`}
          type="number"
          value={value?.max ?? ''}
          onChange={(event) =>
            onChange({
              ...value,
              max: event.target.value === '' ? undefined : Number(event.target.value),
            })
          }
        />
      </label>
    </fieldset>
  );
}
