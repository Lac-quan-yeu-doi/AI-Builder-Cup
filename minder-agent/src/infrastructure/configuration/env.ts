const REQUIRED = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"] as const;

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider?: string;
  modelThinking?: string;
  temperature?: number;
  maxTokens?: number;
}

export class ConfigError extends Error {
  readonly code = "configuration" as const;
  readonly variable: (typeof REQUIRED)[number];

  constructor(variable: (typeof REQUIRED)[number]) {
    super(`Missing required environment variable: ${variable}.`);
    this.name = "ConfigError";
    this.variable = variable;
  }
}

export function loadLlmConfig(env: NodeJS.ProcessEnv): LlmConfig {
  for (const variable of REQUIRED) {
    if (!env[variable]?.trim()) {
      throw new ConfigError(variable);
    }
  }

  const parsedTemperature =
    env.LLM_TEMPERATURE === undefined
      ? undefined
      : Number.parseFloat(env.LLM_TEMPERATURE);
  const modelThinking = env.LLM_MODEL_THINKING?.trim();
  const parsedMaxTokens =
    env.LLM_MAX_TOKENS === undefined
      ? undefined
      : Number.parseInt(env.LLM_MAX_TOKENS, 10);

  const config: LlmConfig = {
    baseUrl: env.LLM_BASE_URL!.trim().replace(/\/+$/, ""),
    apiKey: env.LLM_API_KEY!.trim(),
    model: env.LLM_MODEL!.trim(),
  };
  const provider =
    env.LLM_PROVIDER?.trim() ||
    inferProvider(config.model, config.baseUrl, config.apiKey);
  if (provider) config.provider = provider;
  if (modelThinking) config.modelThinking = modelThinking;
  if (
    typeof parsedTemperature === "number" &&
    Number.isFinite(parsedTemperature)
  ) {
    config.temperature = parsedTemperature;
  }
  if (
    typeof parsedMaxTokens === "number" &&
    Number.isInteger(parsedMaxTokens) &&
    parsedMaxTokens > 0
  )
    config.maxTokens = parsedMaxTokens;
  return config;
}

function inferProvider(
  model: string,
  baseUrl: string,
  apiKey: string,
): string | undefined {
  const normalizedModel = model.toLowerCase();
  const normalizedBaseUrl = baseUrl.toLowerCase();
  if (
    normalizedModel.startsWith("gemini") ||
    normalizedModel.startsWith("google") ||
    normalizedBaseUrl.includes("generativelanguage.googleapis.com") ||
    apiKey.startsWith("AIza")
  )
    return "gemini";
  return undefined;
}
