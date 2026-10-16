import { realpath } from "node:fs/promises";
import { createConnection } from "node:net";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ToolResult } from "./types.js";

const SOCKET_PATH =
  process.env.MINDER_SANDBOX_SOCKET ?? "/run/minder-sandbox/runner.sock";
const WORKSPACE_CACHE = resolve(
  process.env.MINDER_WORKSPACE_DIR ?? "/tmp/minder-workspaces",
);
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;

export async function runInWorkspaceSandbox(input: {
  readonly command: string;
  readonly workspaceRoot: string;
  readonly workingDirectory: string;
  readonly signal: AbortSignal;
}): Promise<ToolResult> {
  const [workspaceCache, workspaceRoot, workingDirectoryPath] =
    await Promise.all([
      realpath(WORKSPACE_CACHE),
      realpath(input.workspaceRoot),
      realpath(input.workingDirectory),
    ]);
  const workspacePath = relative(workspaceCache, workspaceRoot);
  if (
    !workspacePath ||
    isAbsolute(workspacePath) ||
    workspacePath === ".." ||
    workspacePath.startsWith(`..${sep}`)
  ) {
    return failure("Workspace is outside the configured workspace cache.");
  }
  const workingDirectory = relative(workspaceRoot, workingDirectoryPath);
  if (
    isAbsolute(workingDirectory) ||
    workingDirectory === ".." ||
    workingDirectory.startsWith(`..${sep}`)
  ) {
    return failure("Working directory is outside the active workspace.");
  }
  if (input.signal.aborted) return failure("Command was interrupted.");

  const request = JSON.stringify({
    command: input.command,
    workspacePath,
    workingDirectory,
  });
  if (Buffer.byteLength(request, "utf8") > MAX_REQUEST_BYTES)
    return failure("Command exceeds the sandbox request size limit.");

  return new Promise((resolveResult) => {
    const socket = createConnection(SOCKET_PATH);
    let response = "";
    let settled = false;
    const finish = (result: ToolResult): void => {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener("abort", abort);
      socket.destroy();
      resolveResult(result);
    };
    const abort = (): void => finish(failure("Command was interrupted."));
    input.signal.addEventListener("abort", abort, { once: true });
    if (input.signal.aborted) abort();
    socket.once("connect", () => socket.write(`${request}\n`));
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (Buffer.byteLength(response, "utf8") > MAX_RESPONSE_BYTES) {
        finish(failure("Sandbox runner response exceeded the size limit."));
        return;
      }
      const newline = response.indexOf("\n");
      if (newline < 0) return;
      try {
        const result = JSON.parse(response.slice(0, newline)) as {
          success?: unknown;
          output?: unknown;
          exitCode?: unknown;
          interrupted?: unknown;
        };
        if (
          typeof result.success !== "boolean" ||
          typeof result.output !== "string" ||
          typeof result.exitCode !== "number"
        ) {
          finish(failure("Sandbox runner returned an invalid response."));
          return;
        }
        finish({
          success: result.success,
          output: result.output,
          metadata: {
            exit_code: result.exitCode,
            ...(result.interrupted === true ? { interrupted: true } : {}),
          },
        });
      } catch {
        finish(failure("Sandbox runner returned an invalid response."));
      }
    });
    socket.once("error", (error) =>
      finish(failure(`Sandbox runner is unavailable: ${error.message}`)),
    );
    socket.once("close", () => {
      if (!settled)
        finish(failure("Sandbox runner closed without a response."));
    });
  });
}

function failure(output: string): ToolResult {
  return { success: false, output, metadata: { exit_code: -1 } };
}
