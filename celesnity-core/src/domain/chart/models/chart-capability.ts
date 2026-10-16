export type ChartCapabilityType = 'TABLE' | 'NUMBER' | 'BAR' | 'LINE' | 'AREA' | 'PIE' | 'SCATTER';

export interface ChartCapability {
  readonly requiredRoles: readonly string[];
  readonly settings: readonly string[];
}

export type ChartCapabilityRegistry = Readonly<Record<ChartCapabilityType, ChartCapability>>;

export const CHART_CAPABILITIES: ChartCapabilityRegistry = Object.freeze({
  TABLE: {
    requiredRoles: ['columns'],
    settings: [
      'columnOrder',
      'columnVisibility',
      'columnLabels',
      'columnFormatting',
      'rowDensity',
      'showRowIndex',
    ],
  },
  NUMBER: {
    requiredRoles: ['measure'],
    settings: [
      'comparison',
      'showTitle',
      'showValue',
      'valueFormatting',
      'prefix',
      'suffix',
      'decimalPlaces',
      'compact',
      'comparisonStyle',
      'colors',
    ],
  },
  PIE: {
    requiredRoles: ['measure', 'breakout'],
    settings: [
      'variant',
      'showLegend',
      'showTotal',
      'showLabels',
      'percentagePlacement',
      'decimalPlaces',
      'minimumSlicePercentage',
      'colors',
    ],
  },
  BAR: {
    requiredRoles: ['category', 'measures'],
    settings: [
      'breakout',
      'orientation',
      'stacking',
      'showLegend',
      'showLabels',
      'axes',
      'colors',
      'valueFormatting',
      'gridlines',
    ],
  },
  LINE: {
    requiredRoles: ['x', 'measures'],
    settings: [
      'series',
      'showLegend',
      'showLabels',
      'axes',
      'colors',
      'valueFormatting',
      'gridlines',
      'interpolation',
      'lineStyle',
      'markers',
      'missingValueHandling',
    ],
  },
  AREA: {
    requiredRoles: ['x', 'measures'],
    settings: [
      'series',
      'stacking',
      'showLegend',
      'showLabels',
      'axes',
      'colors',
      'valueFormatting',
      'gridlines',
      'opacity',
      'missingValueHandling',
    ],
  },
  SCATTER: {
    requiredRoles: ['x', 'y'],
    settings: [
      'series',
      'size',
      'showLegend',
      'showLabels',
      'axes',
      'colors',
      'valueFormatting',
      'gridlines',
      'pointSize',
      'opacity',
    ],
  },
});
