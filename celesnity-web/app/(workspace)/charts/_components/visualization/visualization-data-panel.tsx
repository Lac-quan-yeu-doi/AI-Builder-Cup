'use client';

import type { ReactNode } from 'react';
import type { OutputColumn, VisualizationDefinition } from '@/src/entities/models/canonical-chart';

import { FieldSelect, MultiFieldSelect } from './visualization-field-selectors';

export interface VisualizationDataPanelProps {
  readonly definition: VisualizationDefinition;
  readonly fields: readonly OutputColumn[];
  readonly onChange: (definition: VisualizationDefinition) => void;
}

/** Chart-type-specific data roles. The role names map directly to the saved schema. */
export function VisualizationDataPanel({
  definition,
  fields,
  onChange,
}: VisualizationDataPanelProps) {
  switch (definition.type) {
    case 'TABLE':
      return (
        <Panel title="Table columns">
          <MultiFieldSelect
            label="Shown, in order"
            values={definition.roles.columns}
            fields={fields}
            onChange={(columns) => onChange({ ...definition, roles: { columns } })}
          />
        </Panel>
      );
    case 'NUMBER':
      return (
        <Panel title="Number">
          <FieldSelect
            label="Measure"
            value={definition.roles.measure}
            fields={fields}
            onChange={(measure) => onChange({ ...definition, roles: { measure } })}
          />
        </Panel>
      );
    case 'PIE':
      return (
        <Panel title="Pie chart data">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSelect
              label="Measure"
              value={definition.roles.measure}
              fields={fields}
              onChange={(measure) =>
                onChange({ ...definition, roles: { ...definition.roles, measure } })
              }
            />
            <FieldSelect
              label="Breakout"
              value={definition.roles.breakout}
              fields={fields}
              onChange={(breakout) =>
                onChange({ ...definition, roles: { ...definition.roles, breakout } })
              }
            />
          </div>
        </Panel>
      );
    case 'BAR':
      return (
        <Panel title="Bar chart data">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSelect
              label="X-axis"
              value={definition.roles.category}
              fields={fields}
              onChange={(category) =>
                onChange({ ...definition, roles: { ...definition.roles, category } })
              }
            />
            <MultiFieldSelect
              label="Y-axis"
              values={definition.roles.measures}
              fields={fields}
              onChange={(measures) =>
                onChange({ ...definition, roles: { ...definition.roles, measures } })
              }
            />
            <FieldSelect
              label="Series / color"
              value={definition.roles.breakout ?? ''}
              fields={fields}
              allowEmpty
              onChange={(breakout) =>
                onChange({
                  ...definition,
                  roles: { ...definition.roles, breakout: breakout || undefined },
                })
              }
            />
          </div>
        </Panel>
      );
    case 'LINE':
    case 'AREA':
      return (
        <Panel title={`${definition.type === 'LINE' ? 'Line' : 'Area'} chart data`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSelect
              label="X-axis"
              value={definition.roles.x}
              fields={fields}
              onChange={(x) => onChange({ ...definition, roles: { ...definition.roles, x } })}
            />
            <MultiFieldSelect
              label="Y-axis"
              values={definition.roles.measures}
              fields={fields}
              onChange={(measures) =>
                onChange({ ...definition, roles: { ...definition.roles, measures } })
              }
            />
            <FieldSelect
              label="Series / color"
              value={definition.roles.series ?? ''}
              fields={fields}
              allowEmpty
              onChange={(series) =>
                onChange({
                  ...definition,
                  roles: { ...definition.roles, series: series || undefined },
                })
              }
            />
          </div>
        </Panel>
      );
    case 'SCATTER':
      return (
        <Panel title="Scatter plot data">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSelect
              label="X-axis"
              value={definition.roles.x}
              fields={fields}
              onChange={(x) => onChange({ ...definition, roles: { ...definition.roles, x } })}
            />
            <FieldSelect
              label="Y-axis"
              value={definition.roles.y}
              fields={fields}
              onChange={(y) => onChange({ ...definition, roles: { ...definition.roles, y } })}
            />
            <FieldSelect
              label="Series / color"
              value={definition.roles.series ?? ''}
              fields={fields}
              allowEmpty
              onChange={(series) =>
                onChange({
                  ...definition,
                  roles: { ...definition.roles, series: series || undefined },
                })
              }
            />
            <FieldSelect
              label="Bubble size"
              value={definition.roles.size ?? ''}
              fields={fields}
              allowEmpty
              onChange={(size) =>
                onChange({ ...definition, roles: { ...definition.roles, size: size || undefined } })
              }
            />
          </div>
        </Panel>
      );
  }
}

function Panel({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      className="space-y-4 rounded-md border border-border bg-background p-3"
      aria-label={title}
    >
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-body-sm font-semibold">{title}</h3>
        {description ? <p className="text-caption text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
