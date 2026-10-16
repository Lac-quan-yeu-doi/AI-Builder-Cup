import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = await mkdtemp(join(tmpdir(), "minder-bash-client-"));
const cache = join(root, "cache");
const workspace = join(cache, "room");
const socketPath = join(root, "runner.sock");
await mkdir(workspace, { recursive: true });
process.env.MINDER_WORKSPACE_DIR = cache;
process.env.MINDER_SANDBOX_SOCKET = socketPath;

let respond:
  ((request: Record<string, unknown>, socket: Socket) => void) | undefined;
const server = createServer((socket) => {
  let input = "";
  socket.on("data", (chunk) => {
    input += chunk.toString("utf8");
    const newline = input.indexOf("\n");
    if (newline < 0) return;
    respond?.(
      JSON.parse(input.slice(0, newline)) as Record<string, unknown>,
      socket,
    );
  });
});

const { runInWorkspaceSandbox } =
  await import("@infrastructure/tools/core/sandbox-runner-client.js");

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});

describe("workspace sandbox client", () => {
  it("sends the trusted workspace identity without a timeout", async () => {
    let received: Record<string, unknown> | undefined;
    respond = (request, socket) => {
      received = request;
      socket.end(
        `${JSON.stringify({ success: true, output: "done", exitCode: 0 })}\n`,
      );
    };
    const signal = new AbortController().signal;
    await expect(
      runInWorkspaceSandbox({
        command: "typst compile report.typ reports/report.pdf",
        workspaceRoot: workspace,
        workingDirectory: workspace,
        signal,
      }),
    ).resolves.toMatchObject({
      success: true,
      output: "done",
      metadata: { exit_code: 0 },
    });
    expect(received).toEqual({
      command: "typst compile report.typ reports/report.pdf",
      workspacePath: "room",
      workingDirectory: "",
    });
  });

  it("interrupts an in-flight command when its signal aborts", async () => {
    respond = () => undefined;
    const controller = new AbortController();
    const result = runInWorkspaceSandbox({
      command: "sleep 60",
      workspaceRoot: workspace,
      workingDirectory: workspace,
      signal: controller.signal,
    });
    controller.abort();
    await expect(result).resolves.toMatchObject({ success: false });
  });
});
