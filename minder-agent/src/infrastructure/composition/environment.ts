import {
  CoreAssertionAuthenticator,
  InMemoryAssertionReplayCache,
  PostgresAssertionReplayStore,
  type AssertionReplayCache,
} from "@infrastructure/auth";
import {
  loadLlmConfig,
  loadMinderAuthConfig,
  type LlmConfig,
  type MinderAuthConfig,
} from "@infrastructure/configuration";
import type {
  AuthOptions,
  CompositionOptions,
  CompositionResourceScope,
} from "./types.js";

export function createCompositionResourceScope(): CompositionResourceScope {
  const cleanups: Array<() => Promise<void>> = [];
  let committed = false;
  let closed = false;
  return {
    add(cleanup) {
      if (!committed && !closed) cleanups.push(cleanup);
    },
    commit() {
      committed = true;
      cleanups.length = 0;
    },
    async close() {
      if (closed) return;
      closed = true;
      let firstError: Error | undefined;
      for (const cleanup of [...cleanups].reverse()) {
        try {
          await cleanup();
        } catch (error) {
          firstError ??=
            error instanceof Error ? error : new Error(String(error));
        }
      }
      cleanups.length = 0;
      if (firstError !== undefined) throw firstError;
    },
  };
}

export function normalizeProductionEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(
    Object.entries(environment).map(([key, value]) => [
      key,
      typeof value === "string" ? value.trim() : value,
    ]),
  );
}

export type AgentLoopStrategy = "react" | "langchain";

export function loadAgentLoopStrategy(
  environment: Readonly<Record<string, string | undefined>> | undefined,
): AgentLoopStrategy {
  const value = environment?.MINDER_AGENT_LOOP?.trim().toLowerCase() || "react";
  if (value === "react" || value === "langchain") return value;
  throw new Error("MINDER_AGENT_LOOP must be react or langchain.");
}

export function isLlmConfigured(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return [
    environment.LLM_BASE_URL,
    environment.LLM_API_KEY,
    environment.LLM_MODEL,
  ].every((value) => Boolean(value?.trim()));
}

export function loadConfiguredLlmConfig(
  options: CompositionOptions | undefined,
): LlmConfig | undefined {
  if (options === undefined || !isLlmConfigured(options.environment))
    return undefined;
  return loadLlmConfig(options.environment);
}

export function normalizePostgresConnectionString(
  connectionString: string,
): string {
  const normalized = connectionString.trim();
  if (
    !/^postgres(?:ql)?:\/\//iu.test(normalized) ||
    /[?&]uselibpqcompat=/iu.test(normalized)
  )
    return normalized;
  const fragmentIndex = normalized.indexOf("#");
  const base =
    fragmentIndex === -1 ? normalized : normalized.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? "" : normalized.slice(fragmentIndex);
  const separator = base.includes("?")
    ? base.endsWith("?") || base.endsWith("&")
      ? ""
      : "&"
    : "?";
  return `${base}${separator}uselibpqcompat=true${fragment}`;
}

export function createProductionAuthOptions(
  environment: Readonly<Record<string, string | undefined>>,
  replayCache?: AssertionReplayCache,
): AuthOptions {
  return {
    authenticator: createCoreAssertionAuthenticator(
      loadMinderAuthConfig(environment),
      replayCache,
    ),
  };
}

export function createConfiguredAuthOptions(
  options: CompositionOptions | undefined,
): AuthOptions | undefined {
  if (options === undefined) return undefined;
  const environment = options.environment;
  const hasAuthConfiguration = hasAuthenticationConfiguration(environment);
  if (!hasAuthConfiguration && !isLlmConfigured(environment)) return undefined;
  return options.authOptions ?? createProductionAuthOptions(environment);
}

/**
 * Nest startup variant: production assertions use shared replay state so the
 * same token cannot be accepted by another replica or after a pod restart.
 */
export async function createNestAuthOptions(
  options: CompositionOptions | undefined,
): Promise<AuthOptions | undefined> {
  if (options === undefined || options.authOptions !== undefined)
    return options?.authOptions;
  if (!hasAuthenticationConfiguration(options.environment))
    return createConfiguredAuthOptions(options);
  if (options.environment.NODE_ENV !== "production")
    return createConfiguredAuthOptions(options);

  const connectionString = options.environment.DATABASE_URL?.trim();
  if (!connectionString)
    throw new Error(
      "Production requires DATABASE_URL for durable assertion replay protection.",
    );
  const replayStore = await PostgresAssertionReplayStore.connect(
    { connectionString: normalizePostgresConnectionString(connectionString) },
    options.environment.MINDER_DATABASE_SCHEMA?.trim() || "minder_agent",
  );
  options.resourceScope?.add(() => replayStore.onModuleDestroy());
  return {
    ...createProductionAuthOptions(options.environment, replayStore),
    shutdown: () => replayStore.onModuleDestroy(),
  };
}

function createCoreAssertionAuthenticator(
  config: MinderAuthConfig,
  replayCache: AssertionReplayCache = new InMemoryAssertionReplayCache(
    config.replayCacheCapacity,
  ),
): CoreAssertionAuthenticator {
  return new CoreAssertionAuthenticator({
    issuer: config.issuer,
    audience: config.audience,
    publicKeys: config.publicKeys,
    replayCache,
    now: () => Math.floor(Date.now() / 1_000),
  });
}

function hasAuthenticationConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return [
    environment.NODE_ENV === "production" ? "production" : undefined,
    environment.MINDER_AUTH_MODE,
    environment.MINDER_ASSERTION_ISSUER,
    environment.MINDER_ASSERTION_AUDIENCE,
    environment.MINDER_ASSERTION_PUBLIC_KEYS_JSON,
  ].some((value) => Boolean(value?.trim()));
}
