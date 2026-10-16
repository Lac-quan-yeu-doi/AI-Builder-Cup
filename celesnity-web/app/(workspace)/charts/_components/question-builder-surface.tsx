'use client';

import type {
  VisualQueryDefinition,
  VisualQueryPreviewStage,
} from '@/src/entities/models/canonical-chart';
import type { QueryPreviewState } from './chart-builder-state';
import type { RelationMetadataMap } from '@/src/interface-adapters/presenters/chart-builder-field.presenter';

import { VisualQueryNotebook } from './notebook/visual-query-notebook';
import { QueryPreviewPane } from './preview/query-preview-pane';
import type { DataSourceBrowserControllers } from './data-source-picker/data-source-picker.types';

export interface QuestionBuilderSurfaceProps {
  readonly query: VisualQueryDefinition;
  readonly relations: RelationMetadataMap;
  readonly controllers: DataSourceBrowserControllers;
  readonly onChange: (query: VisualQueryDefinition) => void;
  readonly onRelationsChange?: (relations: RelationMetadataMap) => void;
  readonly onVisualize: () => void;
  readonly onPreviewStep?: (stage: VisualQueryPreviewStage) => void;
  readonly previewDisabled?: boolean;
  readonly queryPreview?: QueryPreviewState;
  readonly onRetryPreview?: () => void;
}

/**
 * Question-mode composition: a progressive notebook plus its transient preview.
 *
 * The surface used to open with its own eyebrow and `<h1>` directly under the
 * builder's header, which already had one — and with a derived title ("Average
 * by Machine") that restated in prose what the notebook shows in full a few
 * pixels lower. Both are gone; the source path moved up into the one header.
 */
export function QuestionBuilderSurface({
  query,
  relations,
  controllers,
  onChange,
  onRelationsChange,
  onVisualize,
  onPreviewStep,
  previewDisabled = false,
  queryPreview,
  onRetryPreview,
}: QuestionBuilderSurfaceProps) {
  return (
    <section className="bg-background" aria-label="Question builder">
      <div className="w-full max-w-5xl space-y-5 px-5 py-6 lg:px-8 lg:py-8">
        {queryPreview ? (
          <QueryPreviewPane
            status={queryPreview.status}
            preview={queryPreview.result}
            durationMs={queryPreview.durationMs}
            error={queryPreview.error}
            onRetry={onRetryPreview}
          />
        ) : null}
        <VisualQueryNotebook
          query={query}
          relations={relations}
          controllers={controllers}
          onChange={onChange}
          onRelationsChange={onRelationsChange}
          onPreviewStep={onPreviewStep}
          previewDisabled={previewDisabled}
          onVisualize={onVisualize}
        />
      </div>
    </section>
  );
}

/** The one-line summary of what a visual query reads, for the header subtitle. */
export function questionSourcePath(query: VisualQueryDefinition): string | null {
  if (!query.source.table.table) return null;
  return [query.context.catalog, query.context.schema, query.source.table.table].join(' / ');
}
