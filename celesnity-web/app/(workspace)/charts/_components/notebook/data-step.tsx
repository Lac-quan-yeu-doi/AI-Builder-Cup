'use client';

import { useState } from 'react';
import { Table2Icon } from 'lucide-react';

import type { VisualQueryDefinition } from '@/src/entities/models/canonical-chart';
import type { RelationMetadataMap } from '@/src/interface-adapters/presenters/chart-builder-field.presenter';

import { DataSourcePicker } from '../data-source-picker/data-source-picker';
import { SourceStart } from '../data-source-picker/source-start';
import type {
  DataSourceBrowserControllers,
  DataSourceSelection,
} from '../data-source-picker/data-source-picker.types';
import { createRelationAlias } from '../relation-alias';
import { ClauseChip } from '../ui/clause-chip';
import { NotebookStepBand } from '../ui/notebook-step-band';
import { NotebookPreviewButton } from '../ui/notebook-preview-button';
import { useAnalyticsRecentsStore } from '@/app/_stores/analytics-recents.store';
import { JoinEditor } from './join-editor';

export interface DataStepProps {
  readonly query: VisualQueryDefinition;
  readonly relations: RelationMetadataMap;
  readonly controllers: DataSourceBrowserControllers;
  readonly onChange: (query: VisualQueryDefinition) => void;
  readonly onRelationsChange?: (relations: RelationMetadataMap) => void;
  readonly onPreviewStep?: () => void;
  readonly onJoinPreviewStep?: () => void;
  readonly previewDisabled?: boolean;
}

/** The first notebook step: a picker before source selection, then a compact source band. */
export function DataStep({
  query,
  relations,
  controllers,
  onChange,
  onRelationsChange,
  onPreviewStep,
  onJoinPreviewStep,
  previewDisabled = false,
}: DataStepProps) {
  const [pickerOpen, setPickerOpen] = useState(query.source.table.table.length === 0);
  const hasSource = query.source.table.table.length > 0;
  function selectSource(selection: DataSourceSelection): void {
    if (!selection.table) return;
    const alias = createRelationAlias(selection.table, 'source');
    const next: VisualQueryDefinition = {
      ...query,
      context: { catalog: selection.catalog, schema: selection.schema },
      source: {
        table: {
          catalog: selection.catalog,
          schema: selection.schema,
          table: selection.table,
        },
        alias,
      },
      joins: [],
      projections: [],
      customExpressions: [],
      filters: [],
      aggregations: [],
      breakouts: [],
      postAggregationFilters: [],
      orderBy: [],
    };
    const nextRelations = { [alias]: selection.columns };
    // What the next question will lead with.
    useAnalyticsRecentsStore.getState().noteTable({
      catalog: selection.catalog,
      schema: selection.schema,
      table: selection.table,
    });
    onRelationsChange?.(nextRelations);
    onChange(next);
    setPickerOpen(false);
  }

  if (!hasSource) {
    return (
      <SourceStart
        controllers={controllers}
        onSelect={selectSource}
        title="Pick a table to start from"
      />
    );
  }

  return (
    <div className="space-y-3" aria-label="Data step" role="region">
      <NotebookStepBand
        tone="DATA"
        label="Data"
        action={
          <div className="flex items-center">
            {onPreviewStep ? (
              <NotebookPreviewButton
                label="Data"
                onClick={onPreviewStep}
                disabled={previewDisabled}
              />
            ) : null}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <ClauseChip
            tone="DATA"
            ariaLabel="Source table"
            editAriaLabel="Change data"
            editIcon={<Table2Icon aria-hidden="true" className="size-3.5 shrink-0" />}
            onEdit={() => setPickerOpen((open) => !open)}
          >
            {query.source.table.table}
          </ClauseChip>
        </div>
        {pickerOpen ? (
          <div className="mt-3 max-w-xl">
            <DataSourcePicker mode="TABLE" controllers={controllers} onSelect={selectSource} />
          </div>
        ) : null}
      </NotebookStepBand>
      <JoinEditor
        query={query}
        relations={relations}
        controllers={controllers}
        onChange={onChange}
        onRelationsChange={onRelationsChange}
        onPreviewStep={onJoinPreviewStep}
        previewDisabled={previewDisabled}
      />
    </div>
  );
}
