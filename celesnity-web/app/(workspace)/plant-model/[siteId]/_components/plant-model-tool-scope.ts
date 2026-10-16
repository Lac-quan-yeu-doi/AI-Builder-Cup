import type { PlantModelToolScope } from '@/src/entities/models/chat';
import type { PlantSite } from '@/src/entities/models/plant-model';

/**
 * Constant-size typed binding for one Plant Model chat turn. The agent runtime
 * consumes it as tool metadata; it is never serialized into the LLM prompt.
 */
export function buildPlantModelToolScope(
  site: PlantSite,
  selectedNodeId?: string,
  selectedRelationshipId?: string,
  selectedDashboardId?: string,
): PlantModelToolScope {
  return {
    plantSiteId: site.id,
    draftRevision: site.revision,
    ...(selectedNodeId === undefined ? {} : { selectedNodeId }),
    ...(selectedRelationshipId === undefined ? {} : { selectedRelationshipId }),
    ...(selectedDashboardId === undefined ? {} : { selectedDashboardId }),
  };
}
