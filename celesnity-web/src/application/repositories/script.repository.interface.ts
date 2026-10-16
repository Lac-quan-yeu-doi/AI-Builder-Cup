import type {
  ActiveConnectionOption,
  PublishedScriptSource,
  RunScriptResult,
  Script,
  ScriptMetadata,
  ScriptVersion,
} from '@/src/entities/models/script';

export interface ScriptRepository {
  listScripts(): Promise<readonly Script[]>;
  getScript(id: string): Promise<Script>;
  createScript(metadata: ScriptMetadata): Promise<Script>;
  updateScriptMetadata(id: string, metadata: ScriptMetadata): Promise<Script>;
  publishVersion(scriptId: string, source: string): Promise<ScriptVersion>;
  listVersions(scriptId: string): Promise<readonly ScriptVersion[]>;
  loadVersionSource(scriptId: string, versionNumber: number): Promise<PublishedScriptSource>;
  listActiveConnections(): Promise<readonly ActiveConnectionOption[]>;
  runVersion(scriptId: string, versionNumber: number): Promise<RunScriptResult>;
}
