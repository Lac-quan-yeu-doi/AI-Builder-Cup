import { mkdir, readFile, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { RoomId, RunId, WorkspacePath } from "@domain/index.js";
import type {
  FileAccessPort,
  WorkspacePort,
  WorkspaceTree,
} from "@application/shared/ports/index.js";
import { normalizeWorkspacePath, roomKeySegment } from "../paths/safe-path.js";

export interface LocalWorkspaceOptions {
  readonly baseDirectory: string;
  readonly fileAccess?: FileAccessPort;
  readonly runId?: RunId;
}

export interface LocalWorkspaceAdapter extends WorkspacePort {
  readonly kind: "local";
}

export function createLocalWorkspacePort(
  options: LocalWorkspaceOptions,
): LocalWorkspaceAdapter {
  return new LocalWorkspace(options);
}

class LocalWorkspace implements LocalWorkspaceAdapter {
  readonly kind = "local" as const;
  private readonly baseDirectory: string;
  private readonly fileAccess?: FileAccessPort;
  private readonly runId?: RunId;

  constructor(options: LocalWorkspaceOptions) {
    this.baseDirectory = options.baseDirectory;
    if (options.fileAccess) this.fileAccess = options.fileAccess;
    if (options.runId) this.runId = options.runId;
  }

  async ensure(roomId: RoomId): Promise<WorkspacePath> {
    const base = await this.base();
    const root = resolve(base, roomKeySegment(roomId));
    assertInside(base, root);
    await mkdir(root, { recursive: true });
    return root as WorkspacePath;
  }

  async tree(input: {
    readonly roomId: RoomId;
    readonly path?: string;
  }): Promise<WorkspaceTree> {
    const root = await this.ensure(input.roomId);
    const path = normalizeWorkspacePath(input.path ?? "");
    const directory = await this.existingPath(root, path);
    const metadata = await stat(directory);
    if (!metadata.isDirectory())
      throw new Error("Workspace path is not a directory.");
    const entries = await readdir(directory, { withFileTypes: true });
    const mapped = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = `${path ? `${path}/` : ""}${entry.name}`;
        if (entry.isDirectory())
          return { path: entryPath, kind: "directory" as const };
        if (!entry.isFile())
          throw new Error("Workspace contains an unsupported special file.");
        const details = await stat(resolve(directory, entry.name));
        return { path: entryPath, kind: "file" as const, size: details.size };
      }),
    );
    return {
      path,
      entries: mapped.sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
    };
  }

  async read(input: {
    readonly roomId: RoomId;
    readonly path: string;
  }): Promise<{ path: string; content: Uint8Array; contentType?: string }> {
    const root = await this.ensure(input.roomId);
    const path = normalizeWorkspacePath(input.path);
    if (!path) throw new Error("Workspace file path is required.");
    const target = await this.existingPath(root, path);
    const metadata = await stat(target);
    if (!metadata.isFile()) throw new Error("Workspace path is not a file.");
    const content = new Uint8Array(await readFile(target));
    await this.recordAccess(path);
    return { path, content };
  }

  async sync(_path: WorkspacePath): Promise<void> {
    // Local workspaces are immediately durable on their backing volume.
  }

  private async recordAccess(path: string): Promise<void> {
    if (!this.fileAccess || !this.runId) return;
    await this.fileAccess.record({
      runId: this.runId,
      path,
      operation: "read",
      at: new Date().toISOString(),
    });
  }

  private async base(): Promise<string> {
    await mkdir(this.baseDirectory, { recursive: true });
    return realpath(this.baseDirectory);
  }

  private async existingPath(root: string, path: string): Promise<string> {
    const candidate = resolve(root, path);
    assertInside(root, candidate);
    const canonical = await realpath(candidate);
    assertInside(root, canonical);
    return canonical;
  }
}

function assertInside(root: string, candidate: string): void {
  const distance = relative(root, candidate);
  if (distance.startsWith("..") || isAbsolute(distance))
    throw new Error("Workspace path is outside the workspace.");
}
