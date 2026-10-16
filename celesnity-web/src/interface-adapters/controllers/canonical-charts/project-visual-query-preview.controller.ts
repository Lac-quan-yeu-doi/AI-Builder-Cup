import {
  projectVisualQueryPreview,
  type VisualQueryPreviewStage,
} from '@/src/application/use-cases/canonical-charts/project-visual-query-preview.use-case';
import type { VisualQueryDefinition } from '@/src/entities/models/canonical-chart';

/** Adapter boundary for the pure preview projection used by the chart editor. */
export function projectQueryForPreview(
  query: VisualQueryDefinition,
  stage: VisualQueryPreviewStage,
): VisualQueryDefinition {
  return projectVisualQueryPreview(query, stage);
}
