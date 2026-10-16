import type { Script } from '@domain/script-authoring/aggregates/script';
import type { ScriptVersion } from '@domain/script-authoring/entities/script-version';
import type {
  ScriptVersionView,
  ScriptView,
} from '@application/script-authoring/interfaces/i-script-reader';

/**
 * Projects an in-memory {@link Script} onto its read model, so a command answers
 * from the aggregate it just committed rather than re-reading the row.
 *
 * `status` is fixed rather than derived: every path that projects a script has
 * already asserted the script is active, and an archived script is not returned
 * from a command at all.
 */
export function toScriptView(script: Script): ScriptView {
  const currentVersion = script.currentVersion;
  return {
    id: script.id.value,
    name: script.name.value,
    description: script.description.value,
    connectionId: script.connectionId,
    status: 'ACTIVE',
    currentVersion:
      currentVersion === undefined
        ? undefined
        : toScriptVersionView(currentVersion, script.artifactBucket),
    createdAt: script.createdAt.toISOString(),
    updatedAt: script.updatedAt.toISOString(),
  };
}

/** Projects a published {@link ScriptVersion} entity onto its read model. */
export function toScriptVersionView(
  version: ScriptVersion,
  artifactBucket: string,
): ScriptVersionView {
  return {
    id: version.id.value,
    scriptId: version.scriptId.value,
    versionNumber: version.versionNumber.value,
    artifactBucket,
    objectKey: version.artifactLocation.objectKey,
    contentSha256: version.sourceHash.value,
    contentSize: version.contentSize,
    publishedAt: version.publishedAt.toISOString(),
  };
}
