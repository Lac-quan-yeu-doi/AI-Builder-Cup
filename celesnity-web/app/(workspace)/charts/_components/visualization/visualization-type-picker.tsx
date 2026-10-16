'use client';

import {
  ChartArea,
  ChartLine,
  ChartNoAxesColumn,
  ChartPie,
  ChartScatter,
  Hash,
  Table2,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/_components/ui/tooltip';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { TranslationKey } from '@/app/_i18n/en';
import {
  createDefaultVisualization,
  type OutputColumn,
  type VisualizationType,
} from '@/src/entities/models/canonical-chart';

import { visualizationFits, visualizationOrder, type ShapeReason } from './visualization-shape';

const visualizationIcons = {
  TABLE: Table2,
  NUMBER: Hash,
  BAR: ChartNoAxesColumn,
  LINE: ChartLine,
  AREA: ChartArea,
  PIE: ChartPie,
  SCATTER: ChartScatter,
} satisfies Record<VisualizationType, LucideIcon>;

const visualizationLabels: Record<VisualizationType, string> = {
  TABLE: 'Table',
  NUMBER: 'Number',
  BAR: 'Bar',
  LINE: 'Line',
  AREA: 'Area',
  PIE: 'Pie',
  SCATTER: 'Scatter',
};

const labelKeys: Record<VisualizationType, TranslationKey> = {
  TABLE: 'viz.table',
  NUMBER: 'viz.number',
  BAR: 'viz.bar',
  LINE: 'viz.line',
  AREA: 'viz.area',
  PIE: 'viz.pie',
  SCATTER: 'viz.scatter',
};

const reasonKeys: Record<ShapeReason, TranslationKey> = {
  MEASURE: 'viz.needsMeasure',
  CATEGORY: 'viz.needsCategory',
  TWO_MEASURES: 'viz.needsTwoMeasures',
};

export interface VisualizationTypePickerProps {
  readonly type: VisualizationType;
  readonly onChange: (definition: ReturnType<typeof createDefaultVisualization>) => void;
  readonly onTypeChange?: (type: VisualizationType) => void;
  readonly className?: string;
  readonly compact?: boolean;
  /** The current result's columns, used to disqualify shapes that cannot draw it. */
  readonly columns?: readonly OutputColumn[];
}

/**
 * The chart-type switcher.
 *
 * It used to live behind a floating pill at the bottom of the canvas, in a
 * panel that replaced the settings panel entirely and needed its own "Done"
 * button to get back. Choosing a chart type is the most frequent decision on
 * this screen, so it sits in the initial display now — a single row of
 * toggles above the settings tabs.
 */
export function VisualizationTypePicker({
  type,
  onChange,
  onTypeChange,
  className,
  compact = false,
  columns = [],
}: VisualizationTypePickerProps) {
  const { t } = useTranslation();
  const fits = visualizationFits(columns);

  return (
    <div
      className={cn(compact ? 'grid grid-cols-7 gap-1' : 'grid grid-cols-7 gap-2', className)}
      role="group"
      aria-label={t('viz.chartType')}
    >
      {visualizationOrder.map((item) => {
        const Icon = visualizationIcons[item];
        const selected = type === item;
        const fit = fits.find((candidate) => candidate.type === item);
        const disabled = fit ? !fit.available && !selected : false;
        const label = t(labelKeys[item]);
        const button = (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'size-10 rounded-md border transition-colors',
              selected
                ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
              disabled && 'opacity-40',
            )}
            aria-pressed={selected}
            aria-label={label}
            disabled={disabled}
            onClick={() =>
              onTypeChange ? onTypeChange(item) : onChange(createDefaultVisualization(item))
            }
          >
            <Icon aria-hidden="true" className="size-4.5" />
          </Button>
        );
        return (
          <Tooltip key={item}>
            {/* A disabled button swallows pointer events, so the reason it is
                disabled has to hang off a wrapper or it is unreachable. */}
            <TooltipTrigger asChild>
              {disabled ? <span className="inline-flex">{button}</span> : button}
            </TooltipTrigger>
            <TooltipContent>
              {label}
              {disabled && fit?.reason ? ` — ${t(reasonKeys[fit.reason])}` : ''}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export { visualizationIcons, visualizationLabels };
