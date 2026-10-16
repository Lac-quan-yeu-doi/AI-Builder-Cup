import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import type {
  PublicationResult,
  TutorialDefinition,
  TutorialId,
} from '@/src/entities/models/tutorial-definition';

export interface TutorialRepository {
  /**
   * Lists only tutorials accessible under the member's existing Workspace
   * authorization; filtering and omission of inaccessible details happen server-side.
   */
  listAccessibleCatalog(): Promise<readonly PublishedCatalogTutorial[]>;
  getDefinition(id: TutorialId): Promise<TutorialDefinition>;
  publish(candidate: TutorialDefinition): Promise<PublicationResult>;
}
