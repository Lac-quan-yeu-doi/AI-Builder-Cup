import type { McpServerConfig } from "../protocol/server.js";
import { createMcpTransport } from "../protocol/manager.js";
import { RemoteMcpTransport } from "./remote-transport.js";
import type { McpTransport } from "./transport.js";

const CORE_MCP_PATHS = new Set([
  "/api/v1/chart-mcp",
  "/api/v1/cloud-file-mcp",
  "/api/v1/document-mcp",
  "/api/v1/trino-mcp",
  "/api/v1/skill-mcp",
  "/api/v1/automation-workflow-mcp",
  "/api/v1/plant-model-mcp",
]);

/** Only operator-configured Core endpoints can receive workload credentials. */
export function createCoreMcpTransportFactory(
  environment: Readonly<Record<string, string | undefined>>,
  request: typeof fetch = globalThis.fetch,
): (config: McpServerConfig) => McpTransport {
  if (environment.NODE_ENV !== "production") return createMcpTransport;

  const core = environment.CELESNITY_CORE_URL?.trim();
  const audience = environment.CELESNITY_CORE_AUDIENCE?.trim();
  if (!core || !audience)
    throw new Error(
      "Core MCP workload identity requires Core URL and audience.",
    );
  const coreUrl = new URL(core);

  return (config) => {
    if (config.kind !== "remote" || !isTrustedCoreMcpUrl(config.url, coreUrl))
      return createMcpTransport(config);

    return new RemoteMcpTransport({
      url: config.url,
      headers: config.headers,
      fetch: createCoreWorkloadIdentityFetch(audience, request),
    });
  };
}

export function createCoreWorkloadIdentityFetch(
  audience: string,
  request: typeof fetch,
): typeof fetch {
  return async (input, init) => {
    const metadata = new URL(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity",
    );
    metadata.searchParams.set("audience", audience);
    metadata.searchParams.set("format", "full");
    const tokenResponse = await request(metadata, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(5_000),
      redirect: "error",
    });
    if (!tokenResponse.ok)
      throw new Error("Core MCP workload credential unavailable");
    const token = (await tokenResponse.text()).trim();
    if (!token) throw new Error("Core MCP workload credential unavailable");

    const headers = new Headers(init?.headers);
    headers.delete("x-mcp-shared-secret");
    headers.set("authorization", `Bearer ${token}`);
    return request(input, { ...init, headers, redirect: "error" });
  };
}

export function isTrustedCoreMcpUrl(value: string, core: URL): boolean {
  const target = new URL(value);
  return (
    target.origin === core.origin &&
    !target.username &&
    !target.password &&
    target.search === "" &&
    target.hash === "" &&
    CORE_MCP_PATHS.has(target.pathname)
  );
}
