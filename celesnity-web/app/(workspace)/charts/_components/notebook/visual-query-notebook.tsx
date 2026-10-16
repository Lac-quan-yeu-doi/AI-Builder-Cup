'use client';

import { ChartNoAxesCombinedIcon, FilterIcon, ListOrderedIcon, SigmaIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import type {
  VisualQueryDefinition,
  VisualQueryPreviewStage,
} from '@/src/entities/models/canonical-chart';
import type { DataSourceBrowserControllers } from '../data-source-picker/data-source-picker.types';

import { DataStep } from './data-step';
import { FilterStep } from './filter-step';
import { NotebookEditorProvider } from './notebook-editor-context';
import type { RelationMetadataMap } from '@/src/interface-adapters/presenters/chart-builder-field.presenter';
import { SortLimitStep } from './sort-limit-step';
import { SummarizeStep } from './summarize-step';

export interface VisualQueryNotebookProps {
  readonly query: VisualQueryDefinition;
  readonly relations: RelationMetadataMap;
  readonly controllers: DataSourceBrowserControllers;
  readonly onChange: (query: VisualQueryDefinition) => void;
  readonly onRelationsChange?: (relations: RelationMetadataMap) => void;
  readonly onPreviewStep?: (stage: VisualQueryPreviewStage) => void;
  readonly previewDisabled?: boolean;
  readonly onVisualize?: () => void;
}

/** Ordered Metabase-style notebook for a visual question. */
export function VisualQueryNotebook({
  query,
  relations,
  controllers,
  onChange,
  onRelationsChange,
  onPreviewStep,
  previewDisabled = false,
  onVisualize,
}: VisualQueryNotebookProps) {
  const hasSource = query.source.table.table.length > 0;

  function updateRelations(next: RelationMetadataMap): void {
    onRelationsChange?.(next);
  }

  return (
    <NotebookEditorProvider>
      <div className="space-y-5" aria-label="Visual query notebook" role="region">
        <DataStep
          query={query}
          relations={relations}
          controllers={controllers}
          onChange={onChange}
          onRelationsChange={updateRelations}
          onPreviewStep={onPreviewStep ? () => onPreviewStep('DATA') : undefined}
          onJoinPreviewStep={onPreviewStep ? () => onPreviewStep('JOIN') : undefined}
          previewDisabled={previewDisabled}
        />
        {hasSource ? null : <StepsAhead />}
        {hasSource ? (
          <>
            <FilterStep
              query={query}
              relations={relations}
              onChange={onChange}
              onPreviewStep={onPreviewStep ? () => onPreviewStep('FILTER') : undefined}
              previewDisabled={previewDisabled}
            />
            <SummarizeStep
              query={query}
              relations={relations}
              onChange={onChange}
              onPreviewStep={onPreviewStep ? () => onPreviewStep('SUMMARIZE') : undefined}
              previewDisabled={previewDisabled}
            />
            <SortLimitStep
              query={query}
              relations={relations}
              onChange={onChange}
              onPreviewStep={onPreviewStep ? () => onPreviewStep('SORT_LIMIT') : undefined}
              previewDisabled={previewDisabled}
            />
            {onVisualize ? (
              <Button
                type="button"
                size="lg"
                className="w-full sm:w-55"
                disabled={previewDisabled}
                onClick={onVisualize}
              >
                <ChartNoAxesCombinedIcon aria-hidden="true" />
                Visualize
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </NotebookEditorProvider>
  );
}

/**
 * The steps a question is made of, before there is a source to apply them to.
 *
 * Filter, Summarize and Sort mount only once a table is chosen, so the shape of
 * the task was hidden at exactly the moment someone is deciding whether to take
 * it on. Shown disabled, they cost one quiet row and answer "what is a
 * question, here?".
 */
function StepsAhead() {
  const steps = [
    { label: 'Filter', icon: FilterIcon },
    { label: 'Summarize', icon: SigmaIcon },
    { label: 'Sort & limit', icon: ListOrderedIcon },
  ];
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t border-border pt-4 text-caption text-muted-foreground"
      aria-hidden="true"
    >
      <span>Then</span>
      {steps.map((step) => (
        <span
          key={step.label}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1"
        >
          <step.icon className="size-3.5" />
          {step.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <ChartNoAxesCombinedIcon className="size-3.5" /> Visualize
      </span>
    </div>
  );
}
