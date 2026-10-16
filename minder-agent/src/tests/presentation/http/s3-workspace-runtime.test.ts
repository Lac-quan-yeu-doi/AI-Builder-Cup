import { describe, expect, it } from "vitest";
import { createProductionWorkspaceProvider } from "../../support/workspace-runtime.js";

describe("production workspace runtime", () => {
  it("fails closed when MinIO credentials are absent", async () => {
    await expect(createProductionWorkspaceProvider({})).rejects.toThrow(
      "MINIO_ENDPOINT",
    );
  });
});
