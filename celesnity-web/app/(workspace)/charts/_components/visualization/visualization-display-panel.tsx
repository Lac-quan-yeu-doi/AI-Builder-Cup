'use client';

import type { ReactNode } from 'react';

import { Input } from '@/app/_components/ui/input';
import type {
  AxisSettings,
  ColorSettings,
  ValueFormattingSettings,
  VisualizationDefinition,
} from '@/src/entities/models/canonical-chart';

type CartesianDefinition = Extract<
  VisualizationDefinition,
  { readonly type: 'BAR' | 'LINE' | 'AREA' | 'SCATTER' }
>;
type CartesianDisplay = CartesianDefinition['display'];

export interface VisualizationDisplayPanelProps {
  readonly definition: VisualizationDefinition;
  readonly onChange: (definition: VisualizationDefinition) => void;
}

/** Metabase-inspired display controls, kept type-specific and schema-preserving. */
export function VisualizationDisplayPanel({
  definition,
  onChange,
}: VisualizationDisplayPanelProps) {
  const updateDisplay = (display: VisualizationDefinition['display']): void => {
    onChange({ ...definition, display } as VisualizationDefinition);
  };

  if (definition.type === 'PIE') {
    return (
      <div className="space-y-4" aria-label="Display settings">
        <Panel
          title="Pie / donut display"
          description="Control labels, percentages, and slice formatting."
        >
          <FieldSelect
            label="Variant"
            value={definition.display.variant ?? 'PIE'}
            options={['PIE', 'DONUT']}
            onChange={(variant) =>
              updateDisplay({ ...definition.display, variant: variant as 'PIE' | 'DONUT' })
            }
          />
          <Toggle
            label="Show legend"
            checked={definition.display.showLegend ?? true}
            onChange={(showLegend) => updateDisplay({ ...definition.display, showLegend })}
          />
          <Toggle
            label="Show total"
            checked={definition.display.showTotal ?? false}
            onChange={(showTotal) => updateDisplay({ ...definition.display, showTotal })}
          />
          <Toggle
            label="Show labels"
            checked={definition.display.showLabels ?? false}
            onChange={(showLabels) => updateDisplay({ ...definition.display, showLabels })}
          />
          <FieldSelect
            label="Show percentages"
            value={definition.display.percentagePlacement ?? 'OFF'}
            options={['OFF', 'IN_LEGEND', 'ON_CHART', 'BOTH']}
            optionLabels={{
              OFF: 'Off',
              IN_LEGEND: 'In legend',
              ON_CHART: 'On the chart',
              BOTH: 'Both',
            }}
            onChange={(percentagePlacement) =>
              updateDisplay({
                ...definition.display,
                percentagePlacement: percentagePlacement as
                  'OFF' | 'IN_LEGEND' | 'ON_CHART' | 'BOTH',
              })
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput
              label="Number of decimal places"
              value={definition.display.decimalPlaces}
              min={0}
              max={10}
              onChange={(decimalPlaces) => updateDisplay({ ...definition.display, decimalPlaces })}
            />
            <NumberInput
              label="Minimum slice percentage"
              value={definition.display.minimumSlicePercentage ?? 2.5}
              min={0}
              max={100}
              step={0.1}
              onChange={(minimumSlicePercentage) =>
                updateDisplay({ ...definition.display, minimumSlicePercentage })
              }
            />
          </div>
          <NumberInput
            label="Donut radius"
            value={definition.display.donutRadius ?? 0.65}
            min={0}
            max={1}
            step={0.05}
            onChange={(donutRadius) => updateDisplay({ ...definition.display, donutRadius })}
          />
          <ColorPicker
            value={definition.display.colors}
            onChange={(colors) => updateDisplay({ ...definition.display, colors })}
          />
        </Panel>
      </div>
    );
  }

  if (definition.type === 'TABLE') {
    return (
      <div className="space-y-4" aria-label="Display settings">
        <Panel title="Table display" description="Tune density, search, and row presentation.">
          <FieldSelect
            label="Row density"
            value={definition.display.rowDensity ?? 'DEFAULT'}
            options={['COMPACT', 'DEFAULT', 'SPACIOUS']}
            onChange={(rowDensity) =>
              updateDisplay({
                ...definition.display,
                rowDensity: rowDensity as 'COMPACT' | 'DEFAULT' | 'SPACIOUS',
              })
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle
              label="Show row index"
              checked={definition.display.showRowIndex ?? false}
              onChange={(showRowIndex) => updateDisplay({ ...definition.display, showRowIndex })}
            />
            <Toggle
              label="Enable search"
              checked={definition.display.enableSearch ?? true}
              onChange={(enableSearch) => updateDisplay({ ...definition.display, enableSearch })}
            />
          </div>
          <NumberInput
            label="Page size"
            value={definition.display.pageSize ?? 50}
            min={1}
            max={1000}
            onChange={(pageSize) => updateDisplay({ ...definition.display, pageSize })}
          />
        </Panel>
      </div>
    );
  }

  if (definition.type === 'NUMBER') {
    return (
      <div className="space-y-4" aria-label="Display settings">
        <Panel title="Number display" description="Control the value, comparison, and formatting.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle
              label="Show title"
              checked={definition.display.showTitle ?? true}
              onChange={(showTitle) => updateDisplay({ ...definition.display, showTitle })}
            />
            <Toggle
              label="Show value"
              checked={definition.display.showValue ?? true}
              onChange={(showValue) => updateDisplay({ ...definition.display, showValue })}
            />
          </div>
          <FieldSelect
            label="Comparison style"
            value={definition.display.comparisonStyle ?? 'DELTA'}
            options={['DELTA', 'PERCENT', 'ICON']}
            onChange={(comparisonStyle) =>
              updateDisplay({
                ...definition.display,
                comparisonStyle: comparisonStyle as 'DELTA' | 'PERCENT' | 'ICON',
              })
            }
          />
          <ValueFormatting
            value={definition.display.valueFormatting}
            onChange={(valueFormatting) =>
              updateDisplay({ ...definition.display, valueFormatting })
            }
          />
        </Panel>
      </div>
    );
  }

  const cartesian = definition as CartesianDefinition;
  const display = cartesian.display;
  const updateCartesianDisplay = (next: CartesianDisplay): void => updateDisplay(next);
  return (
    <div className="space-y-4" aria-label="Display settings">
      <Panel
        title={`${definition.type} display`}
        description="Style axes, series, labels, and values."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Toggle
            label="Show legend"
            checked={display.showLegend ?? true}
            onChange={(showLegend) => updateCartesianDisplay({ ...display, showLegend })}
          />
          <Toggle
            label="Show values on data points"
            checked={display.showLabels ?? false}
            onChange={(showLabels) => updateCartesianDisplay({ ...display, showLabels })}
          />
        </div>
        {'orientation' in display ? (
          <FieldSelect
            label="Orientation"
            value={display.orientation ?? 'VERTICAL'}
            options={['VERTICAL', 'HORIZONTAL']}
            onChange={(orientation) =>
              updateCartesianDisplay({
                ...display,
                orientation: orientation as 'VERTICAL' | 'HORIZONTAL',
              })
            }
          />
        ) : null}
        {'stacking' in display ? (
          <FieldSelect
            label="Stacking"
            value={display.stacking ?? 'NONE'}
            options={['NONE', 'STACKED', 'PERCENT']}
            onChange={(stacking) =>
              updateCartesianDisplay({
                ...display,
                stacking: stacking as 'NONE' | 'STACKED' | 'PERCENT',
              })
            }
          />
        ) : null}
        {'interpolation' in display ? (
          <FieldSelect
            label="Interpolation"
            value={display.interpolation ?? 'LINEAR'}
            options={['LINEAR', 'STEP', 'SMOOTH']}
            onChange={(interpolation) =>
              updateCartesianDisplay({
                ...display,
                interpolation: interpolation as 'LINEAR' | 'STEP' | 'SMOOTH',
              })
            }
          />
        ) : null}
        {'lineStyle' in display ? (
          <FieldSelect
            label="Line style"
            value={display.lineStyle ?? 'SOLID'}
            options={['SOLID', 'DASHED', 'DOTTED']}
            onChange={(lineStyle) =>
              updateCartesianDisplay({
                ...display,
                lineStyle: lineStyle as 'SOLID' | 'DASHED' | 'DOTTED',
              })
            }
          />
        ) : null}
        {'markers' in display ? (
          <Toggle
            label="Show markers"
            checked={display.markers ?? true}
            onChange={(markers) => updateCartesianDisplay({ ...display, markers })}
          />
        ) : null}
        {'missingValueHandling' in display ? (
          <FieldSelect
            label="Missing values"
            value={display.missingValueHandling ?? 'LINE'}
            options={['LINE', 'ZERO', 'GAP']}
            onChange={(missingValueHandling) =>
              updateCartesianDisplay({
                ...display,
                missingValueHandling: missingValueHandling as 'LINE' | 'ZERO' | 'GAP',
              })
            }
          />
        ) : null}
        {'opacity' in display ? (
          <NumberInput
            label="Opacity"
            value={display.opacity ?? 0.8}
            min={0}
            max={1}
            step={0.05}
            onChange={(opacity) => updateCartesianDisplay({ ...display, opacity })}
          />
        ) : null}
        {'pointSize' in display ? (
          <NumberInput
            label="Point size"
            value={display.pointSize ?? 60}
            min={1}
            max={500}
            onChange={(pointSize) => updateCartesianDisplay({ ...display, pointSize })}
          />
        ) : null}
        <Toggle
          label="Show gridlines"
          checked={display.gridlines ?? true}
          onChange={(gridlines) => updateCartesianDisplay({ ...display, gridlines })}
        />
        <ValueFormatting
          value={display.valueFormatting}
          onChange={(valueFormatting) => updateCartesianDisplay({ ...display, valueFormatting })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <AxisPanel
            label="X-axis"
            value={display.axes?.x}
            onChange={(x) => updateCartesianDisplay({ ...display, axes: { ...display.axes, x } })}
          />
          <AxisPanel
            label="Y-axis"
            value={display.axes?.y}
            onChange={(y) => updateCartesianDisplay({ ...display, axes: { ...display.axes, y } })}
          />
        </div>
        <ColorPicker
          value={display.colors}
          onChange={(colors) => updateCartesianDisplay({ ...display, colors })}
        />
      </Panel>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5" aria-label={title}>
      <div>
        <h3 className="text-body-sm font-semibold">{title}</h3>
        <p className="text-caption text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function FieldSelect({
  label,
  value,
  options,
  optionLabels,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly optionLabels?: Readonly<Record<string, string>>;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-body-sm font-medium">
      {label}
      <select
        aria-label={label}
        className="h-9 rounded-md border border-input bg-background px-3 text-body-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  readonly label: string;
  readonly value?: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="grid gap-2 text-body-sm font-medium">
      {label}
      <Input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? undefined : Number(event.target.value))
        }
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-body-sm font-medium">
      {label}
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function ValueFormatting({
  value,
  onChange,
}: {
  readonly value?: ValueFormattingSettings;
  readonly onChange: (value: ValueFormattingSettings) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-md border border-border p-3">
      <legend className="px-1 text-caption font-semibold">Value formatting</legend>
      <FieldSelect
        label="Value format"
        value={value?.style ?? 'AUTO'}
        options={['AUTO', 'NUMBER', 'CURRENCY', 'PERCENT', 'SCIENTIFIC']}
        onChange={(style) =>
          onChange({ ...value, style: style as NonNullable<ValueFormattingSettings['style']> })
        }
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberInput
          label="Decimal places"
          value={value?.decimalPlaces}
          min={0}
          max={10}
          onChange={(decimalPlaces) => onChange({ ...value, decimalPlaces })}
        />
        <label className="grid gap-2 text-body-sm font-medium">
          Format prefix
          <Input
            aria-label="Format prefix"
            placeholder="Prefix"
            value={value?.prefix ?? ''}
            onChange={(event) => onChange({ ...value, prefix: event.target.value || undefined })}
          />
        </label>
      </div>
      <label className="grid gap-2 text-body-sm font-medium">
        Format suffix
        <Input
          aria-label="Format suffix"
          placeholder="Suffix"
          value={value?.suffix ?? ''}
          onChange={(event) => onChange({ ...value, suffix: event.target.value || undefined })}
        />
      </label>
      <Toggle
        label="Compact notation"
        checked={value?.compact ?? false}
        onChange={(compact) => onChange({ ...value, compact })}
      />
    </fieldset>
  );
}

function AxisPanel({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value?: AxisSettings;
  readonly onChange: (value: AxisSettings) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-md border border-border p-3">
      <legend className="px-1 text-caption font-semibold">{label}</legend>
      <Input
        aria-label={`${label} title`}
        placeholder="Axis title"
        value={value?.title ?? ''}
        onChange={(event) => onChange({ ...value, title: event.target.value || undefined })}
      />
      <FieldSelect
        label={`${label} scale`}
        value={value?.scale ?? 'LINEAR'}
        options={['LINEAR', 'LOG', 'POW']}
        onChange={(scale) => onChange({ ...value, scale: scale as AxisSettings['scale'] })}
      />
      <Toggle
        label="Visible"
        checked={value?.visible ?? true}
        onChange={(visible) => onChange({ ...value, visible })}
      />
    </fieldset>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  readonly value?: ColorSettings;
  readonly onChange: (value: ColorSettings) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-md border border-border p-3">
      <legend className="px-1 text-caption font-semibold">Colors</legend>
      <FieldSelect
        label="Color palette"
        value={value?.palette ?? 'DEFAULT'}
        options={['DEFAULT', 'VIBRANT', 'MONOCHROME', 'COLORBLIND_SAFE']}
        onChange={(palette) => onChange({ ...value, palette })}
      />
      <p className="text-caption text-muted-foreground">
        Colors are semantic settings and do not persist preview rows.
      </p>
    </fieldset>
  );
}
