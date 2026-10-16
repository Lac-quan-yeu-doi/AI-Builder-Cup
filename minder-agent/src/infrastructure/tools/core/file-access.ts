import type { FileAccessPort } from "@application/shared/ports/index.js";
import { runId as toRunId } from "@domain/index.js";

export async function recordFileAccess(
  fileAccess: FileAccessPort | undefined,
  runId: string | undefined,
  path: string,
  operation: "read" | "write" | "delete",
): Promise<void> {
  if (fileAccess === undefined || runId === undefined) return;
  try {
    await fileAccess.record({
      runId: toRunId(runId),
      path,
      operation,
      at: new Date().toISOString(),
    });
  } catch {
    // Provenance must not make a successful workspace operation fail.
  }
}
