export interface MinderPaths {
  readonly root: string;
  readonly data: string;
  readonly config: string;
  readonly cache: string;
}

export const resolveMinderPaths = (root: string): MinderPaths => {
  const normalized = root.replace(/\/+$/, "") || ".";
  return {
    root: normalized,
    data: `${normalized}/data`,
    config: `${normalized}/config`,
    cache: `${normalized}/cache`,
  };
};

export interface EnvironmentModelConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly modelThinking?: string;
  readonly temperature?: number;
}
export const formatConfigForDiagnostics = (
  config: EnvironmentModelConfig,
): string => `baseUrl=${config.baseUrl} apiKey=*** model=${config.model}`;
