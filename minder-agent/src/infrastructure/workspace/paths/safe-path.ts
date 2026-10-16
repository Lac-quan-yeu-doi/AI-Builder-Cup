import { isAbsolute } from "node:path";

export interface SafePathResolver {
  resolve(path: string): string | undefined;
}

/**
 * Normalize a workspace-relative path, rejecting any path that would escape the
 * room root. Shared by the local and object-store adapters so both enforce
 * identical confinement. Throws with a stable "outside the workspace" message.
 */
export function normalizeWorkspacePath(value: string): string {
  if (value === "" || value === ".") return "";
  if (isAbsolute(value) || value.includes("\\"))
    throw new Error("Workspace path is outside the workspace.");
  const normalized = value
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");
  if (normalized.some((segment) => segment === ".."))
    throw new Error("Workspace path is outside the workspace.");
  return normalized.join("/");
}

/** Validate a room id used as a workspace/object key segment. */
export function roomKeySegment(roomId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(roomId))
    throw new Error("Invalid room id for workspace path.");
  return roomId;
}
