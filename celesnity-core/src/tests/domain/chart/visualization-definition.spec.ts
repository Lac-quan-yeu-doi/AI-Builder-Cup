import {
  validateVisualizationDefinition,
  type OutputColumn,
} from '@domain/chart/models/visualization-definition';

const outputSchema: readonly OutputColumn[] = [
  { name: 'region', type: 'VARCHAR', family: 'STRING' },
  { name: 'revenue', type: 'DOUBLE', family: 'NUMBER' },
];

describe('validateVisualizationDefinition', () => {
  it('accepts a donut chart with its measure and breakout in compatible fields', () => {
    expect(() =>
      validateVisualizationDefinition(
        {
          schemaVersion: 1,
          type: 'PIE',
          roles: { measure: 'revenue', breakout: 'region' },
          display: {
            variant: 'DONUT',
            showLegend: true,
            percentagePlacement: 'ON_CHART',
            minimumSlicePercentage: 2.5,
          },
        },
        outputSchema,
      ),
    ).not.toThrow();
  });

  it('rejects a measure mapped to a non-numeric field', () => {
    expect(() =>
      validateVisualizationDefinition(
        {
          schemaVersion: 1,
          type: 'PIE',
          roles: { measure: 'region', breakout: 'revenue' },
          display: {},
        },
        outputSchema,
      ),
    ).toThrow('CHART_BINDING_INVALID');
  });
});
