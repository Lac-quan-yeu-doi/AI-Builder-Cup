import type {
  StartServerOptions,
  CompatibilityServer,
  MinderServeDependencies,
} from "../../support/compatibility-server.js";
import { startCompatibilityServer } from "../../support/compatibility-server.js";
import type { OwnerResolverOptions } from "../../../presentation/http/guards/authentication.js";
import type { RunManager } from "@application/runtime";
import type { AgentConfigurationStore } from "@application/agent";
import type { WorkspaceProvider } from "@application/shared/ports/index.js";

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

type RequestServer =
  | Pick<CompatibilityServer, "address">
  | { address(): { port: number } | string | null };

type TestServerDependencies = MinderServeDependencies;

export function startTestServer(
  input?: TestServerDependencies,
): Promise<CompatibilityServer>;
export function startTestServer(
  runtime?: RunManager,
  agentStore?: AgentConfigurationStore,
  authOptions?: OwnerResolverOptions,
  workspaceProvider?: WorkspaceProvider,
): Promise<CompatibilityServer>;
export async function startTestServer(
  inputOrRuntime?: TestServerDependencies | RunManager,
  agentStore?: AgentConfigurationStore,
  authOptions: OwnerResolverOptions = {},
  workspaceProvider?: WorkspaceProvider,
): Promise<CompatibilityServer> {
  const input =
    isRunManager(inputOrRuntime) || arguments.length > 1
      ? {
          ...(isRunManager(inputOrRuntime) ? { runtime: inputOrRuntime } : {}),
          ...(agentStore === undefined ? {} : { agentStore }),
          authOptions,
          ...(workspaceProvider === undefined ? {} : { workspaceProvider }),
        }
      : (inputOrRuntime ?? {});
  return startCompatibilityServer(
    { host: "127.0.0.1", port: 0 } satisfies StartServerOptions,
    {
      ...(input.debugLog === undefined ? {} : { debugLog: input.debugLog }),
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
      ...(input.agentStore === undefined
        ? {}
        : { agentStore: input.agentStore }),
      ...(input.authOptions === undefined
        ? {}
        : { authOptions: input.authOptions }),
      ...(input.workspaceProvider === undefined
        ? {}
        : { workspaceProvider: input.workspaceProvider }),
      ...(input.roomKeepaliveMs === undefined
        ? {}
        : { roomKeepaliveMs: input.roomKeepaliveMs }),
      ...(input.manifestLoader === undefined
        ? {}
        : { manifestLoader: input.manifestLoader }),
      ...(input.skillServiceForOwner === undefined
        ? {}
        : { skillServiceForOwner: input.skillServiceForOwner }),
      ...(input.webhookSecretResolver === undefined
        ? {}
        : { webhookSecretResolver: input.webhookSecretResolver }),
      ...(input.approvalService === undefined
        ? {}
        : { approvalService: input.approvalService }),
      ...(input.mcpManager === undefined
        ? {}
        : { mcpManager: input.mcpManager }),
      ...(input.mcpTargetResolver === undefined
        ? {}
        : { mcpTargetResolver: input.mcpTargetResolver }),
      ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
    },
  );
}

function isRunManager(value: unknown): value is RunManager {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RunManager).start === "function"
  );
}

export async function request(
  server: RequestServer,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<HttpResponse> {
  const address =
    typeof server.address === "function" ? server.address() : server.address;
  if (address === null || typeof address === "string")
    throw new Error("test server did not expose a TCP address");
  const body =
    options.body === undefined
      ? undefined
      : typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...options.headers,
    },
    ...(body === undefined ? {} : { body }),
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}
