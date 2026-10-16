import type { DatabaseService } from '@domain/database-service/aggregates/database-service';
import {
  toDatabaseServiceSummary,
  type DatabaseServiceView,
} from '@application/database-service/read-models/database-service.view';

/**
 * Projects an in-memory {@link DatabaseService} onto its read model, so a command
 * can answer from the aggregate it just committed instead of loading the row back.
 *
 * The credential is not represented in the view at all — not redacted, absent —
 * which is the same guarantee the read side gets from selecting a column subset.
 * Here it comes for free, because the view type has nowhere to put ciphertext.
 */
export function toDatabaseServiceView(connection: DatabaseService): DatabaseServiceView {
  return {
    id: connection.id.value,
    name: connection.name.value,
    databaseNames: [],
    connectorType: connection.connectorType.value,
    configSchemaVersion: connection.config.schemaVersion,
    config: connection.config.toRecord(),
    summary: toDatabaseServiceSummary(connection.config.toRecord()),
    verificationStatus: connection.verification.status,
    lastTestedAt: connection.verification.lastTestedAt?.toISOString(),
    lastTestError: connection.verification.failureReason,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}
