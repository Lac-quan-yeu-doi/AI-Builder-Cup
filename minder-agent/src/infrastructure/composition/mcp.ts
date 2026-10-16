import type { ManifestLoader } from "@application/agent";
import type { McpRuntimeTargetResolver } from "@application/runtime";
import type {
  DataScope,
  McpManagerTarget,
  McpServerManager,
} from "@infrastructure/mcp";
import {
  createCoreMcpTransportFactory,
  createMcpServerManager,
} from "@infrastructure/mcp";
import type { CompositionOptions, McpTargetResolver } from "./types.js";

export function createMcpManager(
  options: CompositionOptions | undefined,
): McpServerManager {
  const manager =
    options?.factories.createMcpManager?.() ??
    createMcpServerManager({
      createTransport: createCoreMcpTransportFactory(
        options?.environment ?? process.env,
        options?.fetch ?? globalThis.fetch,
      ),
    });
  options?.resourceScope?.add(() => manager.close());
  return manager;
}

export function createMcpTargetResolver(
  manifestLoader: ManifestLoader | undefined,
): McpTargetResolver | undefined {
  if (manifestLoader === undefined) return undefined;
  return async (target) => {
    const loaded = await manifestLoader.get({
      owner: target.owner,
      name: target.agent,
    });
    const config = loaded?.manifest.mcpServers[target.server];
    if (!config) return undefined;
    const scope = {
      allowedCatalogs: [],
      ...(target.dataScope === undefined
        ? {}
        : { dataScope: target.dataScope }),
    };
    if (config.kind === "stdio") {
      if (!config.command || !config.args || !config.env) return undefined;
      return {
        owner: target.owner,
        agent: target.agent,
        server: {
          name: target.server,
          config: {
            kind: "stdio",
            command: config.command,
            args: config.args,
            env: config.env,
            discoveryAllowlist: config.discoveryAllowlist,
          },
        },
        scope,
      };
    }
    if (!config.url || !config.headers) return undefined;
    return {
      owner: target.owner,
      agent: target.agent,
      server: {
        name: target.server,
        config: {
          kind: "remote",
          url: config.url,
          headers: config.headers,
          discoveryAllowlist: config.discoveryAllowlist,
        },
      },
      scope,
    };
  };
}

export function createMcpRunTargetResolver(input: {
  readonly manifestLoader: ManifestLoader | undefined;
  readonly targetResolver: McpTargetResolver | undefined;
}): McpRuntimeTargetResolver | undefined {
  if (input.manifestLoader === undefined || input.targetResolver === undefined)
    return undefined;
  return async ({ owner, agent, dataScope }) => {
    const loaded = await input.manifestLoader!.get({ owner, name: agent });
    if (!loaded) return [];
    const targets = await Promise.all(
      Object.keys(loaded.manifest.mcpServers).map((server) =>
        input.targetResolver!({
          owner,
          agent,
          server,
          ...(dataScope === undefined ? {} : { dataScope }),
        }),
      ),
    );
    return targets.filter(
      (target): target is McpManagerTarget => target !== undefined,
    );
  };
}

export type { DataScope };
