import { ScriptStatus } from '@generated/prisma/enums';
import type { ScriptWhereInput } from '@generated/prisma/models/Script';

/**
 * A script is only writable while it is active, and only at the revision the
 * caller loaded. Both conditions must appear in the `where` clause of every
 * guarded script update, and both the metadata path and the publication path
 * need exactly this pair — which is why it is stated once here rather than
 * copied into each repository.
 *
 * `status` and `archivedAt` are two encodings of the same fact, so both are
 * matched: relying on one would let a half-archived row through.
 */
export function activeScriptAtRevision(criteria: {
  readonly scriptId: string;
  readonly expectedRevision: number;
}): ScriptWhereInput {
  return {
    id: criteria.scriptId,
    status: ScriptStatus.ACTIVE,
    archivedAt: null,
    revision: criteria.expectedRevision,
  };
}
