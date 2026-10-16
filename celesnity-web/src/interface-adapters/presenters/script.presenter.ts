import type {
  ActiveConnectionOption,
  PublishedScriptSource,
  RunScriptResult,
  SaveAndRunScriptResult,
  SaveScriptResult,
  Script,
  ScriptVersion,
} from '@/src/entities/models/script';

export interface ScriptVersionViewModel {
  readonly id: string;
  readonly scriptId: string;
  readonly versionNumber: number;
  readonly artifactBucket: string;
  readonly objectKey: string;
  readonly contentSha256: string;
  readonly contentSize: number;
  readonly publishedAt: string;
}

export interface ScriptViewModel {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly connectionId: string;
  readonly status: 'active';
  readonly currentVersion?: ScriptVersionViewModel;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublishedScriptSourceViewModel {
  readonly version: ScriptVersionViewModel;
  readonly source: string;
}

export interface ActiveConnectionOptionViewModel {
  readonly id: string;
  readonly name: string;
  readonly connectorType: string;
  readonly connectorLabel: string;
}

export interface SaveScriptResultViewModel {
  readonly script: ScriptViewModel;
  readonly version: ScriptVersionViewModel;
}

export interface RunScriptResultViewModel {
  readonly scriptId: string;
  readonly versionNumber: number;
  readonly outcome: 'accepted' | 'execution-service-unavailable';
  readonly executionId?: string;
  readonly status?: string;
}

export interface SaveAndRunScriptResultViewModel {
  readonly saved: SaveScriptResultViewModel;
  readonly run: RunScriptResultViewModel;
}

export function presentScriptVersion(version: ScriptVersion): ScriptVersionViewModel {
  return {
    id: version.id,
    scriptId: version.scriptId,
    versionNumber: version.versionNumber,
    artifactBucket: version.artifactBucket,
    objectKey: version.objectKey,
    contentSha256: version.contentSha256,
    contentSize: version.contentSize,
    publishedAt: version.publishedAt,
  };
}

export function presentScriptVersions(
  versions: readonly ScriptVersion[],
): readonly ScriptVersionViewModel[] {
  return versions.map(presentScriptVersion);
}

export function presentScript(script: Script): ScriptViewModel {
  return {
    id: script.id,
    name: script.name,
    connectionId: script.connectionId,
    status: script.status,
    createdAt: script.createdAt,
    updatedAt: script.updatedAt,
    ...(script.description !== undefined ? { description: script.description } : {}),
    ...(script.currentVersion !== undefined
      ? { currentVersion: presentScriptVersion(script.currentVersion) }
      : {}),
  };
}

export function presentScripts(scripts: readonly Script[]): readonly ScriptViewModel[] {
  return scripts.map(presentScript);
}

export function presentPublishedScriptSource(
  published: PublishedScriptSource,
): PublishedScriptSourceViewModel {
  return { version: presentScriptVersion(published.version), source: published.source };
}

export function presentActiveConnectionOption(
  connection: ActiveConnectionOption,
): ActiveConnectionOptionViewModel {
  return {
    id: connection.id,
    name: connection.name,
    connectorType: connection.connectorType,
    connectorLabel: connection.connectorLabel,
  };
}

export function presentActiveConnectionOptions(
  connections: readonly ActiveConnectionOption[],
): readonly ActiveConnectionOptionViewModel[] {
  return connections.map(presentActiveConnectionOption);
}

export function presentSaveScriptResult(result: SaveScriptResult): SaveScriptResultViewModel {
  return {
    script: presentScript(result.script),
    version: presentScriptVersion(result.version),
  };
}

export function presentRunScriptResult(result: RunScriptResult): RunScriptResultViewModel {
  return {
    scriptId: result.scriptId,
    versionNumber: result.versionNumber,
    outcome: result.outcome,
    ...(result.executionId !== undefined ? { executionId: result.executionId } : {}),
    ...(result.status !== undefined ? { status: result.status } : {}),
  };
}

export function presentSaveAndRunScriptResult(
  result: SaveAndRunScriptResult,
): SaveAndRunScriptResultViewModel {
  return {
    saved: presentSaveScriptResult(result.saved),
    run: presentRunScriptResult(result.run),
  };
}
