import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface ToolSandboxConfig {
  readonly enabled: boolean;
  readonly allowedCommands: readonly string[];
  /** Workspace-relative directories that may be changed by file tools. */
  readonly writablePaths: readonly string[];
}

export function sandboxAllowsCommand(
  sandbox: ToolSandboxConfig | undefined,
  command: string,
): boolean {
  if (!sandbox?.enabled) return true;
  const trimmed = command.trim();
  if (!trimmed || trimmed.includes("$(") || trimmed.includes("`")) return false;
  return trimmed
    .split(/[;&|\n]/u)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .every((segment) => {
      const executable = segment
        .split(/\s+/u)
        .find((part) => !part.includes("=") || part.startsWith("-"));
      return (
        executable !== undefined &&
        sandbox.allowedCommands.includes(
          executable.split("/").pop() ?? executable,
        )
      );
    });
}

export function sandboxAllowsWritablePath(
  sandbox: ToolSandboxConfig | undefined,
  workspaceRoot: string,
  path: string,
): boolean {
  if (!sandbox?.enabled) return true;
  const canonicalWorkspaceRoot = realpathSync(workspaceRoot);
  return sandbox.writablePaths.some((allowed) => {
    const base = resolve(canonicalWorkspaceRoot, allowed);
    const candidate = relative(base, path);
    return (
      candidate === "" ||
      (!candidate.startsWith(`..${sep}`) &&
        candidate !== ".." &&
        !isAbsolute(candidate))
    );
  });
}

export const SANDBOX_COMMAND_DENIAL =
  "Sandbox: command is not in the configured allowed list.";
export const SANDBOX_WRITE_DENIAL =
  "Sandbox: path is not within the configured writable directories.";
