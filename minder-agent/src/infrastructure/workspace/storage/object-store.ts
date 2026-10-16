import type {
  PrincipalScope,
  RoomId,
  RunId,
  WorkspacePath,
} from "@domain/index.js";
import { principalScopeKey } from "@domain/index.js";
import type {
  FileAccessPort,
  WorkspaceContent,
  WorkspaceContentRequest,
  WorkspacePort,
  WorkspaceTree,
  WorkspaceTreeRequest,
} from "@application/shared/ports/index.js";
import { normalizeWorkspacePath, roomKeySegment } from "../paths/safe-path.js";

export interface ObjectStoreObject {
  readonly content: Uint8Array;
  readonly contentType?: string;
}

/**
 * Minimal S3-compatible client contract. A real deployment supplies an adapter
 * over the AWS/MinIO SDK; tests use {@link createMemoryObjectStoreClient}.
 */
export interface ObjectStoreClient {
  getObject(
    bucket: string,
    key: string,
  ): Promise<ObjectStoreObject | undefined>;
  putObject(
    bucket: string,
    key: string,
    content: Uint8Array,
    contentType?: string,
  ): Promise<void>;
  listObjects(bucket: string, prefix: string): Promise<readonly string[]>;
}

export interface ObjectWorkspaceOptions {
  readonly client: ObjectStoreClient;
  readonly bucket: string;
  readonly fileAccess?: FileAccessPort;
  readonly runId?: RunId;
  /**
   * Optional principal scope. When present, every object key is prefixed with a
   * stable per-scope segment so the same room+path in different tenants,
   * organizations, or identities maps to different objects and a foreign scope
   * reads nothing.
   */
  readonly scope?: PrincipalScope;
}

export interface ObjectWorkspaceAdapter extends WorkspacePort {
  readonly kind: "object-store";
}

export function createObjectWorkspacePort(
  options: ObjectWorkspaceOptions,
): ObjectWorkspaceAdapter {
  return new ObjectWorkspace(options);
}

class ObjectWorkspace implements ObjectWorkspaceAdapter {
  readonly kind = "object-store" as const;
  private readonly client: ObjectStoreClient;
  private readonly bucket: string;
  private readonly fileAccess?: FileAccessPort;
  private readonly runId?: RunId;
  private readonly scopePrefix: string;

  constructor(options: ObjectWorkspaceOptions) {
    this.client = options.client;
    this.bucket = options.bucket;
    if (options.fileAccess) this.fileAccess = options.fileAccess;
    if (options.runId) this.runId = options.runId;
    this.scopePrefix = options.scope
      ? `${principalScopeKey(options.scope)}/`
      : "";
  }

  ensure(roomId: RoomId): Promise<WorkspacePath> {
    // Object stores have no directories to create; the key prefix is the root.
    return Promise.resolve(this.rootPrefix(roomId) as WorkspacePath);
  }

  async tree(input: WorkspaceTreeRequest): Promise<WorkspaceTree> {
    const prefix = this.keyFor(input.roomId, input.path ?? "");
    const keys = await this.client.listObjects(this.bucket, prefix);
    const root = this.rootPrefix(input.roomId);
    const entries = keys
      .map((key) => key.slice(root.length))
      .filter((relativeKey) => relativeKey.length > 0)
      .map((relativeKey) => ({
        path: relativeKey,
        kind: "file" as const,
      }));
    return {
      path: normalizeWorkspacePath(input.path ?? ""),
      entries: entries.sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
    };
  }

  async read(input: WorkspaceContentRequest): Promise<WorkspaceContent> {
    const path = normalizeWorkspacePath(input.path);
    if (!path) throw new Error("Workspace file path is required.");
    const object = await this.client.getObject(
      this.bucket,
      this.keyFor(input.roomId, path),
    );
    if (!object) throw new Error("Workspace path is not a file.");
    await this.recordAccess(path);
    return {
      path,
      content: object.content,
      ...(object.contentType === undefined
        ? {}
        : { contentType: object.contentType }),
    };
  }

  async sync(_path: WorkspacePath): Promise<void> {
    // Object writes are durable on acknowledgement.
  }

  private rootPrefix(roomId: RoomId): string {
    return `${this.scopePrefix}${roomKeySegment(roomId)}/`;
  }

  private keyFor(roomId: RoomId, path: string): string {
    const root = this.rootPrefix(roomId);
    const normalized = normalizeWorkspacePath(path);
    return normalized ? `${root}${normalized}` : root;
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
}

/** In-memory object store for tests and single-process defaults. */
export function createMemoryObjectStoreClient(): ObjectStoreClient {
  const objects = new Map<string, ObjectStoreObject>();
  const compose = (bucket: string, key: string): string =>
    `${bucket}\u0000${key}`;
  return {
    async getObject(bucket, key) {
      await Promise.resolve();
      return objects.get(compose(bucket, key));
    },
    async putObject(bucket, key, content, contentType) {
      await Promise.resolve();
      objects.set(compose(bucket, key), {
        content,
        ...(contentType === undefined ? {} : { contentType }),
      });
    },
    async listObjects(bucket, prefix) {
      await Promise.resolve();
      const bucketPrefix = compose(bucket, prefix);
      return [...objects.keys()]
        .filter((key) => key.startsWith(bucketPrefix))
        .map((key) => key.slice(`${bucket}\u0000`.length));
    },
  };
}
