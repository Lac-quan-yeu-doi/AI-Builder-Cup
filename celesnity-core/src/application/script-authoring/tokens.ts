/**
 * Dependency-injection tokens for the Script Authoring ports.
 *
 * Kept out of the port files so each of those declares an interface and its
 * parameter and result types, and nothing else.
 */
export const PUBLISHED_SCRIPT_PROVIDER = Symbol('IPublishedScriptProvider');
export const SCRIPT_METADATA_REPOSITORY = Symbol('IScriptMetadataRepository');
export const SCRIPT_PUBLICATION_LOCK = Symbol('IScriptPublicationLock');
export const SCRIPT_READER = Symbol('IScriptReader');
export const SCRIPT_REPOSITORY = Symbol('IScriptRepository');
export const SCRIPT_VERSION_REPOSITORY = Symbol('IScriptVersionRepository');
export const SOURCE_ARTIFACT_STORE = Symbol('ISourceArtifactStore');
