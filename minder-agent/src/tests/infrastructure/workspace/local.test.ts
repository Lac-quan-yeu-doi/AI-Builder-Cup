import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createLocalWorkspacePort } from "@infrastructure/workspace/index.js";

describe("local workspace port", () => {
  it("provisions a room root and confines reads and tree paths to it", async () => {
    const baseDirectory = await mkdtemp(join(tmpdir(), "minder-workspace-"));
    const workspace = createLocalWorkspacePort({ baseDirectory });
    const roomId = "room-one" as never;
    const root = await workspace.ensure(roomId);
    await writeFile(join(root, "notes.txt"), "hello");
    await writeFile(join(baseDirectory, "outside.txt"), "outside");

    await expect(
      workspace.read({ roomId, path: "notes.txt" }),
    ).resolves.toMatchObject({
      path: "notes.txt",
      content: new TextEncoder().encode("hello"),
    });
    await expect(workspace.tree({ roomId })).resolves.toEqual({
      path: "",
      entries: [{ path: "notes.txt", kind: "file", size: 5 }],
    });
    await expect(
      workspace.read({ roomId, path: "../outside.txt" }),
    ).rejects.toThrow("outside the workspace");
  });
});
