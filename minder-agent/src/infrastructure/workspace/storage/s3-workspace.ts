import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  realpath,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { normalizeWorkspacePath, roomKeySegment } from "../paths/safe-path.js";

const READY_MARKER = ".minder-workspace-ready";
const MANIFEST_WORKSPACE_KEY = "control:agent-manifests";

export interface S3WorkspaceStorage {
  get(key: string): Promise<Uint8Array | undefined>;
  put(key: string, content: Uint8Array): Promise<void>;
  list(prefix: string): Promise<readonly string[]>;
  remove(key: string): Promise<void>;
}

export interface ResolvedS3Workspace {
  readonly root: string;
  readonly prefix: string;
}

export interface S3WorkspaceProviderOptions {
  readonly storage: S3WorkspaceStorage;
  readonly cacheDirectory: string;
}

export interface S3WorkspaceProvider {
  resolve(owner: string, sessionKey: string): Promise<ResolvedS3Workspace>;
  resolvePath(workspaceRoot: string, requested: string): Promise<string>;
  sync(workspace: ResolvedS3Workspace): Promise<void>;
  tree(owner: string, roomId: string): Promise<S3WorkspaceTree>;
  read(
    owner: string,
    roomId: string,
    path: string,
  ): Promise<S3WorkspaceContent | undefined>;
  readSession(
    owner: string,
    sessionKey: string,
    path: string,
    maxBytes?: number,
  ): Promise<S3WorkspaceContent | undefined>;
}

export interface S3WorkspaceTreeEntry {
  readonly path: string;
  readonly isDir: boolean;
  readonly sizeBytes?: number;
  readonly modifiedAt: string;
}

export interface S3WorkspaceTree {
  readonly entries: readonly S3WorkspaceTreeEntry[];
}

export interface S3WorkspaceContent {
  readonly content: Uint8Array;
  readonly contentType: string;
  readonly fileName: string;
}

/** Tenant-scoped text storage for YAML manifests and their prompt assets. */
export interface S3ManifestWorkspace {
  list(owner: string, prefix: string): Promise<readonly string[]>;
  read(owner: string, path: string): Promise<string | undefined>;
  write(owner: string, path: string, content: string): Promise<void>;
  remove(owner: string, path: string): Promise<void>;
}

export interface S3WorkspaceEnvironment {
  readonly MINIO_ENDPOINT?: string;
  readonly MINIO_ACCESS_KEY?: string;
  readonly MINIO_SECRET_KEY?: string;
  readonly MINIO_WORKSPACE_BUCKET?: string;
  readonly MINIO_SECURE?: string;
  readonly MINDER_WORKSPACE_DIR?: string;
}

export function createS3WorkspaceProvider(
  options: S3WorkspaceProviderOptions,
): S3WorkspaceProvider {
  return new CachedS3WorkspaceProvider(options);
}

/**
 * Store tenant control-plane assets in the same S3 backend as runtime
 * workspaces. The stable internal key makes the configuration available to
 * every server process while retaining the provider's owner isolation.
 */
export function createS3ManifestWorkspace(
  provider: S3WorkspaceProvider,
): S3ManifestWorkspace {
  const workspaceFor = (owner: string) =>
    provider.resolve(owner, MANIFEST_WORKSPACE_KEY);
  const targetFor = (root: string, path: string): string =>
    confinedWorkspacePath(root, path);
  return {
    async list(owner, prefix) {
      const workspace = await workspaceFor(owner);
      const normalizedPrefix = prefix.replaceAll("\\", "/");
      if (
        normalizedPrefix.startsWith("/") ||
        normalizedPrefix.split("/").some((part) => part === "..")
      )
        throw new Error("Manifest prefix must remain within the workspace.");
      return (await collectFiles(workspace.root))
        .map((file) => file.path)
        .filter((path) => path.startsWith(normalizedPrefix));
    },
    async read(owner, path) {
      const workspace = await workspaceFor(owner);
      const target = targetFor(workspace.root, path);
      try {
        const metadata = await lstat(target);
        if (!metadata.isFile() || metadata.isSymbolicLink()) return undefined;
        return readFile(target, "utf8");
      } catch (error) {
        if (isMissingFile(error)) return undefined;
        throw error;
      }
    },
    async write(owner, path, content) {
      const workspace = await workspaceFor(owner);
      const target = targetFor(workspace.root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
      await provider.sync(workspace);
    },
    async remove(owner, path) {
      const workspace = await workspaceFor(owner);
      const target = targetFor(workspace.root, path);
      try {
        await rm(target);
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
      await provider.sync(workspace);
    },
  };
}

/**
 * Builds the production provider used by minder-serve. This deliberately
 * rejects incomplete configuration so a running agent can never fall back to
 * its application checkout as a writable workspace.
 */
export function createS3WorkspaceProviderFromEnvironment(
  environment: S3WorkspaceEnvironment,
): Promise<S3WorkspaceProvider> {
  return Promise.resolve().then(() => {
    const endpoint = required(environment, "MINIO_ENDPOINT");
    const accessKeyId = required(environment, "MINIO_ACCESS_KEY");
    const secretAccessKey = required(environment, "MINIO_SECRET_KEY");
    const bucket = required(environment, "MINIO_WORKSPACE_BUCKET");
    const secure = environment.MINIO_SECURE?.trim() === "true";
    const cacheDirectory =
      environment.MINDER_WORKSPACE_DIR?.trim() ||
      join("/tmp", "minder-workspaces");
    const client = new S3Client({
      region: "us-east-1",
      endpoint: endpointUrl(endpoint, secure),
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
    return createS3WorkspaceProvider({
      cacheDirectory,
      storage: createAwsS3WorkspaceStorage(client, bucket),
    });
  });
}

class CachedS3WorkspaceProvider implements S3WorkspaceProvider {
  private readonly storage: S3WorkspaceStorage;
  private readonly cacheDirectory: string;

  constructor(options: S3WorkspaceProviderOptions) {
    this.storage = options.storage;
    this.cacheDirectory = options.cacheDirectory;
  }

  async resolve(
    owner: string,
    sessionKey: string,
  ): Promise<ResolvedS3Workspace> {
    const identity = workspaceIdentity(owner, sessionKey);
    const root = join(
      this.cacheDirectory,
      "scopes",
      identity.owner,
      identity.kind,
      identity.id,
    );
    const workspace = {
      root,
      prefix: `scopes/${identity.owner}/${identity.kind}/${identity.id}/`,
    };
    if (!(await exists(join(root, READY_MARKER)))) {
      await this.hydrate(workspace);
    }
    return workspace;
  }

  async resolvePath(workspaceRoot: string, requested: string): Promise<string> {
    await Promise.resolve();
    return confinedWorkspacePath(workspaceRoot, requested);
  }

  async sync(workspace: ResolvedS3Workspace): Promise<void> {
    const local = await collectFiles(workspace.root);
    const localKeys = new Set<string>();
    for (const file of local) {
      const key = `${workspace.prefix}${file.path}`;
      localKeys.add(key);
      await this.storage.put(key, await readFile(file.absolute));
    }
    const remote = await this.storage.list(workspace.prefix);
    await Promise.all(
      remote
        .filter(
          (key) => key.startsWith(workspace.prefix) && !localKeys.has(key),
        )
        .map((key) => this.storage.remove(key)),
    );
  }

  async tree(owner: string, roomId: string): Promise<S3WorkspaceTree> {
    const workspace = await this.roomWorkspace(owner, roomId);
    return { entries: await collectTree(workspace.root) };
  }

  async read(
    owner: string,
    roomId: string,
    path: string,
  ): Promise<S3WorkspaceContent | undefined> {
    const workspace = await this.roomWorkspace(owner, roomId);
    return this.readWorkspace(workspace, path);
  }

  async readSession(
    owner: string,
    sessionKey: string,
    path: string,
    maxBytes?: number,
  ): Promise<S3WorkspaceContent | undefined> {
    return this.readWorkspace(
      await this.resolve(owner, sessionKey),
      path,
      maxBytes,
    );
  }

  private async readWorkspace(
    workspace: ResolvedS3Workspace,
    path: string,
    maxBytes?: number,
  ): Promise<S3WorkspaceContent | undefined> {
    const normalized = normalizeWorkspacePath(path);
    if (!normalized) throw new Error("Workspace file path is required.");
    const target = resolve(workspace.root, normalized);
    assertWithin(workspace.root, target);
    let metadata;
    try {
      metadata = await lstat(target);
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) return undefined;
    if (maxBytes !== undefined && metadata.size > maxBytes)
      throw new Error("Workspace file is too large.");
    const canonicalRoot = await realpath(workspace.root);
    const canonicalTarget = await realpath(target);
    assertWithin(canonicalRoot, canonicalTarget);
    return {
      content: new Uint8Array(await readFile(canonicalTarget)),
      contentType: contentTypeFor(normalized),
      fileName: normalized.split("/").at(-1) ?? "download",
    };
  }

  private roomWorkspace(
    owner: string,
    roomId: string,
  ): Promise<ResolvedS3Workspace> {
    const room = roomKeySegment(roomId);
    return this.resolve(owner, `room:${room}:agent:workspace`);
  }

  private async hydrate(workspace: ResolvedS3Workspace): Promise<void> {
    await rm(workspace.root, { recursive: true, force: true });
    await mkdir(workspace.root, { recursive: true });
    try {
      for (const key of await this.storage.list(workspace.prefix)) {
        const path = pathFromObjectKey(workspace, key);
        if (path === undefined) continue;
        const content = await this.storage.get(key);
        if (content === undefined) continue;
        const destination = resolve(workspace.root, path);
        assertWithin(workspace.root, destination);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, content);
      }
      await writeFile(
        join(workspace.root, READY_MARKER),
        workspace.prefix,
        "utf8",
      );
    } catch (error) {
      await rm(workspace.root, { recursive: true, force: true });
      throw error;
    }
  }
}

export function createMemoryS3WorkspaceStorage(): S3WorkspaceStorage {
  const objects = new Map<string, Uint8Array>();
  return {
    get(key) {
      return Promise.resolve(objects.get(key));
    },
    put(key, content) {
      objects.set(key, new Uint8Array(content));
      return Promise.resolve();
    },
    list(prefix) {
      return Promise.resolve(
        [...objects.keys()].filter((key) => key.startsWith(prefix)).sort(),
      );
    },
    remove(key) {
      objects.delete(key);
      return Promise.resolve();
    },
  };
}

function createAwsS3WorkspaceStorage(
  client: S3Client,
  bucket: string,
): S3WorkspaceStorage {
  return {
    async get(key) {
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (!response.Body) return undefined;
        return new Uint8Array(await response.Body.transformToByteArray());
      } catch (error) {
        if (isMissingObject(error)) return undefined;
        throw error;
      }
    },
    async put(key, content) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: content }),
      );
    },
    async list(prefix) {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ...(continuationToken === undefined
              ? {}
              : { ContinuationToken: continuationToken }),
          }),
        );
        for (const object of response.Contents ?? []) {
          if (object.Key) keys.push(object.Key);
        }
        continuationToken = response.NextContinuationToken;
      } while (continuationToken !== undefined);
      return keys.sort();
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

function required(
  environment: S3WorkspaceEnvironment,
  name: keyof S3WorkspaceEnvironment,
): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for S3 workspaces.`);
  return value;
}

function endpointUrl(endpoint: string, secure: boolean): string {
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://"))
    return endpoint;
  return `${secure ? "https" : "http"}://${endpoint}`;
}

function isMissingObject(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (("name" in error && error.name === "NoSuchKey") ||
      ("$metadata" in error &&
        typeof error.$metadata === "object" &&
        error.$metadata !== null &&
        "httpStatusCode" in error.$metadata &&
        error.$metadata.httpStatusCode === 404))
  );
}

function workspaceIdentity(
  owner: string,
  sessionKey: string,
): {
  readonly owner: string;
  readonly kind: "rooms" | "sessions";
  readonly id: string;
} {
  if (!owner.trim()) throw new Error("Workspace owner is required.");
  if (!sessionKey.trim()) throw new Error("Workspace session key is required.");
  const room = /^room:([A-Za-z0-9_-]+):agent:[^:]+$/u.exec(sessionKey);
  return {
    owner: digest(owner),
    kind: room?.[1] === undefined ? "sessions" : "rooms",
    id: room?.[1] === undefined ? digest(sessionKey) : room[1],
  };
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function pathFromObjectKey(
  workspace: ResolvedS3Workspace,
  key: string,
): string | undefined {
  if (!key.startsWith(workspace.prefix)) return undefined;
  const relativeKey = key.slice(workspace.prefix.length);
  if (!relativeKey || relativeKey.endsWith("/")) return undefined;
  return normalizeWorkspacePath(relativeKey);
}

async function collectFiles(
  root: string,
): Promise<readonly { path: string; absolute: string }[]> {
  const files: { path: string; absolute: string }[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error("Workspace contains an unsupported symbolic link.");
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name !== READY_MARKER) {
        const path = relative(root, absolute).replaceAll("\\", "/");
        files.push({ path: normalizeWorkspacePath(path), absolute });
      } else if (!entry.isFile()) {
        throw new Error("Workspace contains an unsupported special file.");
      }
    }
  };
  await visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function collectTree(
  root: string,
): Promise<readonly S3WorkspaceTreeEntry[]> {
  const entries: S3WorkspaceTreeEntry[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === READY_MARKER) continue;
      const absolute = join(directory, entry.name);
      const path = normalizeWorkspacePath(
        relative(root, absolute).replaceAll("\\", "/"),
      );
      if (entry.isSymbolicLink())
        throw new Error("Workspace contains an unsupported symbolic link.");
      const metadata = await stat(absolute);
      if (entry.isDirectory()) {
        entries.push({
          path,
          isDir: true,
          modifiedAt: metadata.mtime.toISOString(),
        });
        await visit(absolute);
      } else if (entry.isFile()) {
        entries.push({
          path,
          isDir: false,
          sizeBytes: metadata.size,
          modifiedAt: metadata.mtime.toISOString(),
        });
      } else {
        throw new Error("Workspace contains an unsupported special file.");
      }
    }
  };
  await visit(root);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function contentTypeFor(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase();
  switch (extension) {
    case "md":
      return "text/markdown; charset=utf-8";
    case "txt":
      return "text/plain; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
    case "csv":
      return "text/csv; charset=utf-8";
    case "html":
      return "text/html; charset=utf-8";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

function assertWithin(root: string, candidate: string): void {
  const distance = relative(root, candidate);
  if (distance.startsWith("..") || distance.startsWith("/"))
    throw new Error("Workspace path is outside the workspace.");
}

function confinedWorkspacePath(root: string, requested: string): string {
  const target = resolve(root, normalizeWorkspacePath(requested));
  assertWithin(root, target);
  return target;
}
