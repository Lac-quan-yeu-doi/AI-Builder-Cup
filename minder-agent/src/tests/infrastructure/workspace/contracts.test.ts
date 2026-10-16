import { describe, expect, it } from "vitest";
import { createUnavailableWorkspacePort } from "@infrastructure/workspace";

describe("workspace contracts", () => {
  it("does not provision a workspace before an adapter is implemented", async () => {
    await expect(
      createUnavailableWorkspacePort().ensure("room" as never),
    ).rejects.toThrow("workspace-provider");
  });
});
