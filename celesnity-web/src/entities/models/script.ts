export interface ScriptVersion {
  readonly id: string;
  readonly scriptId: string;
  readonly versionNumber: number;
  readonly artifactBucket: string;
  readonly objectKey: string;
  readonly contentSha256: string;
  readonly contentSize: number;
  readonly publishedAt: string;
}

export interface Script {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly connectionId: string;
  readonly status: 'active';
  readonly currentVersion?: ScriptVersion;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ScriptMetadata {
  readonly name: string;
  readonly description?: string;
  readonly connectionId: string;
}

export interface EditableScriptDraft extends ScriptMetadata {
  readonly scriptId?: string;
  readonly source: string;
  readonly viewedVersionNumber?: number;
}

export interface ActiveConnectionOption {
  readonly id: string;
  readonly name: string;
  readonly connectorType: string;
  readonly connectorLabel: string;
}

export interface PublishedScriptSource {
  readonly version: ScriptVersion;
  readonly source: string;
}

export interface SaveScriptResult {
  readonly script: Script;
  readonly version: ScriptVersion;
}

export type RunScriptOutcome = 'accepted' | 'execution-service-unavailable';

export interface RunScriptResult {
  readonly scriptId: string;
  readonly versionNumber: number;
  readonly outcome: RunScriptOutcome;
  readonly executionId?: string;
  readonly status?: string;
}

export interface SaveAndRunScriptResult {
  readonly saved: SaveScriptResult;
  readonly run: RunScriptResult;
}
