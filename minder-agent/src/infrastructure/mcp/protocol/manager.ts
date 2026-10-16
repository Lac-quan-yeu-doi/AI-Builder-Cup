import type { JsonObject } from "@domain/index.js";
import type { MinderTool } from "@infrastructure/tools/core";
import { createMcpClient, type McpClient, type McpScope } from "./client.js";
import { RemoteMcpTransport } from "../transport/remote-transport.js";
import { resolveEnvironmentVariables, type McpServerConfig } from "./server.js";
import { StdioMcpTransport } from "../transport/stdio-transport.js";
import { createManagedMcpTool, type McpToolDescriptor } from "./tool.js";
import type { McpTransport } from "../transport/transport.js";

export interface NamedMcpServer {
  readonly name: string;
  readonly config: McpServerConfig;
}

export interface McpManagerTarget {
  readonly owner: string;
  readonly agent: string;
  readonly server: NamedMcpServer;
  readonly scope: McpScope;
}

export interface ManagedMcpTool extends McpToolDescriptor {
  readonly name: string;
}

export interface McpManagerCallContext {
  readonly runId?: string;
  readonly roomId?: string;
  readonly callerSubject?: string;
  readonly authorizationRunId?: string;
  readonly automationRunId?: string;
  readonly automationOrganizationId?: string;
}

export type McpAuditEvent =
  | {
      readonly kind: "discovery";
      readonly owner: string;
      readonly agent: string;
      readonly server: string;
      readonly runId?: string;
      readonly toolCount: number;
    }
  | {
      readonly kind: "call";
      readonly owner: string;
      readonly agent: string;
      readonly server: string;
      readonly runId?: string;
      readonly tool: string;
      readonly status: "succeeded" | "denied" | "failed";
      readonly code?: string;
    }
  | {
      readonly kind: "reconnect";
      readonly owner: string;
      readonly agent: string;
      readonly server: string;
      readonly runId?: string;
      readonly status: "succeeded" | "failed";
    };

export type McpAuditSink = (event: McpAuditEvent) => void | Promise<void>;

export type McpServerState =
  "connecting" | "ready" | "degraded" | "unavailable" | "closed";

export interface McpServerStatus {
  readonly owner: string;
  readonly agent: string;
  readonly server: string;
  readonly kind: McpServerConfig["kind"];
  readonly state: McpServerState;
  readonly toolCount: number;
  readonly attempts: number;
  readonly lastError?: string;
}

export interface McpServerManager {
  setAuditSink?(sink: McpAuditSink): void;
  connectAll(
    targets: readonly McpManagerTarget[],
  ): Promise<readonly McpServerStatus[]>;
  discover(target: McpManagerTarget): Promise<readonly ManagedMcpTool[]>;
  toolsForAgent(
    target: McpManagerTarget,
    context?: McpManagerCallContext,
  ): Promise<readonly MinderTool[]>;
  call(
    target: McpManagerTarget,
    name: string,
    arguments_: JsonObject,
    signal?: AbortSignal,
    context?: McpManagerCallContext,
  ): ReturnType<McpClient["call"]>;
  status(owner?: string): Promise<readonly McpServerStatus[]>;
  reconnect(target: McpManagerTarget): Promise<McpServerStatus>;
  closeOwner(owner: string): Promise<void>;
  close(): Promise<void>;
}

export interface McpServerManagerOptions {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly createTransport: (config: McpServerConfig) => McpTransport;
  readonly connectAttempts?: number;
  readonly retryDelayMs?: number;
  readonly requestTimeoutMs?: number;
  readonly auditSink?: McpAuditSink;
}

export function createMcpTransport(config: McpServerConfig): McpTransport {
  if (config.kind === "stdio") {
    return new StdioMcpTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });
  }
  return new RemoteMcpTransport({ url: config.url, headers: config.headers });
}

export function targetsForManifest(input: {
  readonly owner: string;
  readonly agent: string;
  readonly mcpServers: Readonly<Record<string, McpServerConfig>>;
  readonly scope: McpScope;
}): readonly McpManagerTarget[] {
  return Object.entries(input.mcpServers).map(([name, config]) => ({
    owner: input.owner,
    agent: input.agent,
    server: { name, config },
    scope: input.scope,
  }));
}

interface CachedClient {
  readonly owner: string;
  readonly client: McpClient;
}

interface MutableStatus {
  readonly target: McpManagerTarget;
  state: McpServerState;
  toolCount: number;
  attempts: number;
  lastError?: string;
}

export function createMcpServerManager(
  options: McpServerManagerOptions,
): McpServerManager {
  const clients = new Map<string, Promise<CachedClient>>();
  const targets = new Map<string, McpManagerTarget>();
  const statuses = new Map<string, MutableStatus>();
  const environment = options.environment ?? process.env;
  const createTransport = options.createTransport;
  const connectAttempts = Math.max(1, options.connectAttempts ?? 3);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 100);
  const requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 60_000);
  let auditSink = options.auditSink;

  const emit = (event: McpAuditEvent): void => {
    if (!auditSink) return;
    void Promise.resolve(auditSink(event)).catch(() => undefined);
  };

  const keyFor = (target: McpManagerTarget): string =>
    target.owner +
    "\\u0000" +
    target.agent +
    "\\u0000" +
    target.server.name +
    "\\u0000" +
    JSON.stringify({
      allowedCatalogs: [...(target.scope.allowedCatalogs ?? [])].sort(),
      dataScope:
        target.scope.dataScope === undefined
          ? null
          : {
              ...(target.scope.dataScope.catalog === undefined
                ? {}
                : { catalog: target.scope.dataScope.catalog }),
              schema: target.scope.dataScope.schema,
            },
    });

  const clientFor = (target: McpManagerTarget): Promise<CachedClient> => {
    const key = keyFor(target);
    targets.set(key, target);
    const status = statusFor(target, statuses, key);
    status.state = "connecting";
    const existing = clients.get(key);
    if (existing) return existing;
    const config = resolveConfig(target.server.config, environment);
    const pending = Promise.resolve().then(() => ({
      owner: target.owner,
      client: createMcpClient({
        server: target.server.name,
        transport: createTransport(config),
        scope: target.scope,
      }),
    }));
    pending.catch(() => undefined);
    clients.set(key, pending);
    return pending;
  };

  const closeClient = async (key: string): Promise<void> => {
    const pending = clients.get(key);
    clients.delete(key);
    if (!pending) return;
    try {
      const cached = await pending;
      await cached.client.close();
    } catch {
      // The caller is replacing or closing a failed connection; the original
      // error is already represented in the status record.
    }
  };

  const discoverOnce = async (
    target: McpManagerTarget,
  ): Promise<readonly ManagedMcpTool[]> => {
    const key = keyFor(target);
    const status = statusFor(target, statuses, key);
    status.attempts += 1;
    try {
      const { client } = await clientFor(target);
      const discovered = await client.discover();
      const visible = discovered
        .filter(
          (tool) =>
            target.server.config.discoveryAllowlist.length === 0 ||
            target.server.config.discoveryAllowlist.includes(
              localName(target.server.name, tool.name),
            ),
        )
        .map((tool) => ({
          ...tool,
          name:
            "mcp__" +
            target.server.name +
            "__" +
            localName(target.server.name, tool.name),
        }));
      status.state = "ready";
      status.toolCount = visible.length;
      delete status.lastError;
      return visible;
    } catch (error) {
      status.state = "degraded";
      status.lastError = safeError(error);
      throw error;
    }
  };

  const discoverWithRetry = async (
    target: McpManagerTarget,
  ): Promise<readonly ManagedMcpTool[]> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < connectAttempts; attempt += 1) {
      if (attempt > 0) {
        await delay(retryDelayMs);
        await closeClient(keyFor(target));
      }
      try {
        return await discoverOnce(target);
      } catch (error) {
        lastError = error;
      }
    }
    const status = statusFor(target, statuses, keyFor(target));
    status.state = "unavailable";
    status.lastError = safeError(lastError);
    throw lastError instanceof Error ? lastError : new Error(status.lastError);
  };

  return {
    setAuditSink(sink) {
      auditSink = sink;
    },
    async connectAll(targetsToConnect) {
      await Promise.allSettled(
        targetsToConnect.map((target) => discoverWithRetry(target)),
      );
      return this.status();
    },
    async discover(target) {
      return discoverWithRetry(target);
    },
    async toolsForAgent(target, context) {
      try {
        const descriptors = await discoverWithRetry(target);
        emit({
          kind: "discovery",
          owner: target.owner,
          agent: target.agent,
          server: target.server.name,
          ...(context?.runId === undefined ? {} : { runId: context.runId }),
          toolCount: descriptors.length,
        });
        return descriptors.map((descriptor) =>
          createManagedMcpTool({
            target,
            descriptor,
            call: (name, arguments_, signal, toolContext) =>
              this.call(target, name, arguments_, signal, toolContext),
          }),
        );
      } catch (error) {
        emit({
          kind: "discovery",
          owner: target.owner,
          agent: target.agent,
          server: target.server.name,
          ...(context?.runId === undefined ? {} : { runId: context.runId }),
          toolCount: 0,
        });
        throw error;
      }
    },
    async call(target, name, arguments_, signal, context) {
      const local = localNameForManaged(target.server.name, name);
      if (!local) {
        emit({
          kind: "call",
          owner: target.owner,
          agent: target.agent,
          server: target.server.name,
          ...(context?.runId === undefined ? {} : { runId: context.runId }),
          tool: name,
          status: "denied",
          code: "mcp_unknown_tool",
        });
        return {
          success: false,
          code: "mcp_unknown_tool",
          message: "Requested tool is not served by this MCP server.",
        };
      }
      if (
        target.server.config.discoveryAllowlist.length > 0 &&
        !target.server.config.discoveryAllowlist.includes(local)
      ) {
        emit({
          kind: "call",
          owner: target.owner,
          agent: target.agent,
          server: target.server.name,
          ...(context?.runId === undefined ? {} : { runId: context.runId }),
          tool: name,
          status: "denied",
          code: "mcp_unknown_tool",
        });
        return {
          success: false,
          code: "mcp_unknown_tool",
          message: "Requested tool is not served by this MCP server.",
        };
      }
      const metadata = {
        "com.minder/owner": target.owner,
        "com.minder/agent": target.agent,
        ...(context?.runId === undefined
          ? {}
          : { "com.minder/run-id": context.runId }),
        ...(context?.authorizationRunId === undefined
          ? {}
          : {
              "com.celesnity/authorization-run-id": context.authorizationRunId,
            }),
        ...(context?.automationRunId === undefined
          ? {}
          : { "com.celesnity/automation-run-id": context.automationRunId }),
        ...(context?.automationOrganizationId === undefined
          ? {}
          : {
              "com.celesnity/automation-organization-id":
                context.automationOrganizationId,
            }),
        ...(context?.roomId === undefined
          ? {}
          : { "com.minder/room-id": context.roomId }),
        ...(context?.callerSubject === undefined
          ? {}
          : { "com.minder/caller-subject": context.callerSubject }),
        ...(context?.roomId === undefined
          ? {}
          : { "com.celesnity/room-id": context.roomId }),
        ...(context?.callerSubject === undefined
          ? {}
          : { "com.celesnity/caller-subject": context.callerSubject }),
      };
      let lastError: unknown;
      try {
        const { client } = await clientFor(target);
        const result = await withTimeout(
          (requestSignal) =>
            client.call(
              {
                name: target.server.name + ":" + local,
                arguments: arguments_,
                metadata,
              },
              requestSignal,
            ),
          requestTimeoutMs,
          signal,
        );
        const status = statusFor(target, statuses, keyFor(target));
        status.state = "ready";
        delete status.lastError;
        emit({
          kind: "call",
          owner: target.owner,
          agent: target.agent,
          server: target.server.name,
          ...(context?.runId === undefined ? {} : { runId: context.runId }),
          tool: name,
          status: result.success
            ? "succeeded"
            : result.code === "mcp_tool_error"
              ? "failed"
              : "denied",
          ...(result.success ? {} : { code: result.code }),
        });
        return result;
      } catch (error) {
        lastError = error;
        await closeClient(keyFor(target));
      }
      const status = statusFor(target, statuses, keyFor(target));
      status.state = "degraded";
      status.lastError = safeError(lastError);
      emit({
        kind: "call",
        owner: target.owner,
        agent: target.agent,
        server: target.server.name,
        ...(context?.runId === undefined ? {} : { runId: context.runId }),
        tool: name,
        status: "failed",
        code: "mcp_connection_failed",
      });
      emit({
        kind: "reconnect",
        owner: target.owner,
        agent: target.agent,
        server: target.server.name,
        ...(context?.runId === undefined ? {} : { runId: context.runId }),
        status: "failed",
      });
      throw lastError instanceof Error
        ? lastError
        : new Error(status.lastError);
    },
    status(owner) {
      return Promise.resolve(
        [...statuses.values()]
          .filter(
            (entry) => owner === undefined || entry.target.owner === owner,
          )
          .map(toStatus)
          .sort((left, right) =>
            `${left.owner}\u0000${left.agent}\u0000${left.server}`.localeCompare(
              `${right.owner}\u0000${right.agent}\u0000${right.server}`,
            ),
          ),
      );
    },
    async reconnect(target) {
      const key = keyFor(target);
      await closeClient(key);
      const status = statusFor(target, statuses, key);
      status.state = "connecting";
      let reconnected = false;
      try {
        await discoverWithRetry(target);
        reconnected = true;
        emit({
          kind: "reconnect",
          owner: target.owner,
          agent: target.agent,
          server: target.server.name,
          status: "succeeded",
        });
      } catch {
        // The unavailable state and safe error are retained for inspection.
      }
      if (!reconnected)
        emit({
          kind: "reconnect",
          owner: target.owner,
          agent: target.agent,
          server: target.server.name,
          status: "failed",
        });
      return toStatus(status);
    },
    async closeOwner(owner) {
      for (const [key, target] of [...targets.entries()]) {
        if (target.owner !== owner) continue;
        await closeClient(key);
        const status = statuses.get(key);
        if (status) status.state = "closed";
      }
    },
    async close() {
      await Promise.all([...clients.keys()].map((key) => closeClient(key)));
      for (const status of statuses.values()) status.state = "closed";
    },
  };
}

function statusFor(
  target: McpManagerTarget,
  statuses: Map<string, MutableStatus>,
  key: string,
): MutableStatus {
  const existing = statuses.get(key);
  if (existing) return existing;
  const status: MutableStatus = {
    target,
    state: "connecting",
    toolCount: 0,
    attempts: 0,
  };
  statuses.set(key, status);
  return status;
}

function toStatus(status: MutableStatus): McpServerStatus {
  return {
    owner: status.target.owner,
    agent: status.target.agent,
    server: status.target.server.name,
    kind: status.target.server.config.kind,
    state: status.state,
    toolCount: status.toolCount,
    attempts: status.attempts,
    ...(status.lastError === undefined ? {} : { lastError: status.lastError }),
  };
}

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw abortError();
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;
  let onTimeout: (() => void) | undefined;
  let onCallerAbort: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    onTimeout = () => reject(new Error(`mcp_call_timeout_${timeoutMs}ms`));
    timeoutSignal.addEventListener("abort", onTimeout, { once: true });
  });
  const races: Promise<T>[] = [operation(requestSignal), timeout];
  if (signal) {
    races.push(
      new Promise<never>((_, reject) => {
        onCallerAbort = () => reject(abortError());
        signal.addEventListener("abort", onCallerAbort, { once: true });
      }),
    );
  }
  try {
    return await Promise.race(races);
  } catch (error) {
    if (timeoutSignal.aborted && !signal?.aborted)
      throw new Error(`mcp_call_timeout_${timeoutMs}ms`, { cause: error });
    throw error;
  } finally {
    if (onTimeout !== undefined)
      timeoutSignal.removeEventListener("abort", onTimeout);
    if (signal && onCallerAbort !== undefined)
      signal.removeEventListener("abort", onCallerAbort);
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "mcp_connection_failed";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function localName(server: string, discoveredName: string): string {
  const prefix = server + ":";
  return discoveredName.startsWith(prefix)
    ? discoveredName.slice(prefix.length)
    : discoveredName;
}

function localNameForManaged(server: string, name: string): string | undefined {
  const prefix = "mcp__" + server + "__";
  if (!name.startsWith(prefix)) return undefined;
  const local = name.slice(prefix.length);
  return local.length === 0 ? undefined : local;
}

function resolveConfig(
  config: McpServerConfig,
  environment: Readonly<Record<string, string | undefined>>,
): McpServerConfig {
  if (config.kind === "stdio") {
    return {
      ...config,
      command: resolveEnvironmentVariables(config.command, environment),
      args: config.args.map((argument) =>
        resolveEnvironmentVariables(argument, environment),
      ),
      env: Object.fromEntries(
        Object.entries(config.env).map(([key, value]) => [
          key,
          resolveEnvironmentVariables(value, environment),
        ]),
      ),
    };
  }
  return {
    ...config,
    url: resolveEnvironmentVariables(config.url, environment),
    headers: Object.fromEntries(
      Object.entries(config.headers).map(([key, value]) => [
        key,
        resolveEnvironmentVariables(value, environment),
      ]),
    ),
  };
}
