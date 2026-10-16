'use client';

import { useState } from 'react';

import type { OutputColumn, VisualizationDefinition } from '@/src/entities/models/canonical-chart';

import {
  VisualizationSettingsPanel,
  type VisualizationSettingsTab,
} from './visualization-settings-panel';
import { VisualizationTypePicker } from './visualization-type-picker';

export interface VisualizationWorkspaceProps {
  readonly definition: VisualizationDefinition;
  readonly fields: readonly OutputColumn[];
  readonly onChange: (definition: VisualizationDefinition) => void;
  readonly panel?: VisualizationSettingsTab;
}

/** Three-region visualization workspace: chart type, data roles, and display settings. */
export function VisualizationWorkspace({
  definition,
  fields,
  onChange,
  panel: requestedPanel,
}: VisualizationWorkspaceProps) {
  const [panel, setPanel] = useState<VisualizationSettingsTab>(requestedPanel ?? 'DATA');
  const activePanel = requestedPanel ?? panel;

  return (
    <div className="max-w-4xl space-y-5" aria-label="Visualization workspace">
      <section className="space-y-3 border-b border-border pb-4" aria-label="Chart type">
        <div>
          <h2 className="text-body-md font-semibold">Visualization</h2>
        </div>
        <VisualizationTypePicker type={definition.type} onChange={onChange} />
      </section>
      <VisualizationSettingsPanel
        open
        activeTab={activePanel}
        definition={definition}
        fields={fields}
        onTabChange={setPanel}
        onClose={() => undefined}
        onChange={onChange}
      />
    </div>
  );
}
