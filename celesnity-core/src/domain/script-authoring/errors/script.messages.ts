/**
 * Every validation message the Script Authoring context can raise.
 *
 * Kept beside {@link ScriptError} rather than inline at each `throw`, so the
 * wording a caller sees is auditable in one place and a phrasing change is one
 * edit. Fixed messages are constants; messages that name a value or a bound are
 * builders, so the interpolation is written once too.
 *
 * These strings reach clients through the HTTP layer, which is why they are
 * reviewed as a set: they must stay free of internals and consistent in tone.
 */
export const ScriptMessage = {
  // Identity
  invalidScriptId: 'Script ID must be a valid UUID.',
  invalidScriptVersionId: 'Script version ID must be a valid UUID.',

  // Metadata
  descriptionInvalidCharacter: 'Script description contains an invalid character.',

  // Artifact placement
  artifactPrefixMissingScriptId: 'Script artifact prefix must include the script identifier.',
  artifactOutsideWarehouse: 'Script artifacts must be stored outside the Iceberg warehouse bucket.',
  artifactKeyNotRelative:
    'Artifact object key must be relative and contain no empty path segments.',
  versionArtifactKeyNotDeterministic:
    'Script version artifact location must use its deterministic main.py object key.',
  versionArtifactLocationUnexpected: 'Script version uses an unexpected artifact location.',
  invalidSourceHash: 'Source hash must be a 64-character SHA-256 digest.',

  // Temporal invariants
  updateBeforeCreation: 'Script update time cannot precede its creation time.',
  archiveBeforeCreation: 'Script archive time cannot precede its creation time.',
  transitionBeforeLastUpdate: 'A script transition cannot precede its last update.',
  currentVersionAfterUpdate: 'Current script version cannot postdate the script update.',

  // Revision and version invariants
  revisionBeforeCurrentVersion: 'A script revision cannot precede its current version number.',
  revisionExhausted: 'Script revision cannot be incremented further.',
  newScriptAlreadyPublished: 'A new script cannot already have a published version.',
  newScriptRevisionNotZero: 'A new script must start at revision 0.',
  versionMustIncreaseByOne: 'Published script versions must increase by exactly one.',
  versionBelongsToAnotherScript: 'Script version belongs to a different script.',

  // Persistence consistency
  archiveStateInconsistent: 'Persisted script archive state is inconsistent.',

  // Bounded values
  revisionOutOfRange: (maximum: number): string =>
    `Script revision must be an integer between 0 and ${maximum}.`,
  versionNumberOutOfRange: (maximum: number): string =>
    `Version number must be an integer between 1 and ${maximum}.`,
  sourceSizeOutOfRange: (maximum: number): string =>
    `Source size must be an integer between 1 and ${maximum} bytes.`,
  sourceBytesOutOfRange: (maximum: number): string =>
    `Script source must contain between 1 and ${maximum} UTF-8 bytes.`,
} as const;
