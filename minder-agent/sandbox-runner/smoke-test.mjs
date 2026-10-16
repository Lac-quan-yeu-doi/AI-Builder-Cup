// Runs in the runner image with its deployed security policy and disposable mounts.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const socketPath = process.env.MINDER_SANDBOX_SOCKET ?? "/run/minder-sandbox/runner.sock";
const cacheRoot = process.env.MINDER_WORKSPACE_CACHE ?? "/tmp/minder-workspaces";
const scratchRoot = process.env.MINDER_SANDBOX_SCRATCH ?? "/sandbox-scratch";
const workspacePath = `verify-${randomUUID()}`;
const workspaceRoot = join(cacheRoot, workspacePath);
const otherRoot = join(cacheRoot, `${workspacePath}-other`);
const env = {
  PATH: process.env.PATH,
  HOME: "/tmp",
  LANG: "C.UTF-8",
  TMPDIR: "/tmp",
  MINDER_SANDBOX_SOCKET: socketPath,
  MINDER_WORKSPACE_CACHE: cacheRoot,
  MINDER_SANDBOX_SCRATCH: scratchRoot,
};
let runner;
let runnerClosed;
let runnerExit;
let diagnostics = "";
const networkTarget = http.createServer((_request, response) => response.end("fixture"));

async function waitFor(check, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (runnerExit !== undefined) throw new Error(`Runner exited (${runnerExit}): ${diagnostics}`);
    if (await check()) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}: ${diagnostics}`);
}

function connect() {
  return new Promise((resolveSocket, reject) => {
    const socket = net.createConnection(socketPath);
    socket.once("connect", () => resolveSocket(socket));
    socket.once("error", reject);
  });
}

async function request(command, selectedWorkspace = workspacePath) {
  const socket = await connect();
  return new Promise((resolveResponse, reject) => {
    let output = "";
    socket.setTimeout(20_000, () => socket.destroy(new Error("Sandbox request timed out")));
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      output += chunk.toString();
      if (output.length > 32_000) socket.destroy(new Error("Oversized sandbox response"));
    });
    socket.on("end", () => {
      try { resolveResponse(JSON.parse(output)); } catch (error) { reject(error); }
    });
    socket.write(`${JSON.stringify({ command, workspacePath: selectedWorkspace })}\n`);
  });
}

async function succeeds(command, label) {
  const response = await request(command);
  assert.equal(response.success, true, `${label}: ${response.output}`);
  assert.equal(response.exitCode, 0);
  console.log(`PASS ${label}`);
  return response;
}

async function blocked(command, label, selectedWorkspace) {
  const response = await request(command, selectedWorkspace);
  assert.equal(response.success, false, `${label} unexpectedly succeeded`);
  assert.notEqual(response.exitCode, 0);
  assert.ok(!response.output.includes("synthetic-private-value"), `${label} disclosed protected data`);
  console.log(`PASS ${label}`);
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

try {
  await mkdir(workspaceRoot, { recursive: true });
  await mkdir(otherRoot, { recursive: true });
  await writeFile(join(workspaceRoot, "input.txt"), "fixture\n");
  await writeFile(join(workspaceRoot, ".env"), "synthetic-private-value");
  await writeFile(join(workspaceRoot, ".env.example"), "public-template\n");
  await writeFile(join(otherRoot, "private.txt"), "synthetic-private-value");
  await symlink(join(otherRoot, "private.txt"), join(workspaceRoot, "escape-link"));
  runner = spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url))], {
    env, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [runner.stdout, runner.stderr]) {
    stream.on("data", (chunk) => {
      diagnostics += chunk.toString().slice(0, Math.max(0, 4000 - diagnostics.length));
    });
  }
  runnerClosed = new Promise((resolveClosed) => runner.once("close", (code, signal) => {
    runnerExit = code ?? signal;
    resolveClosed();
  }));
  runner.once("error", (error) => { runnerExit = error.message; });
  await waitFor(async () => {
    try { const socket = await connect(); socket.destroy(); return true; } catch { return false; }
  }, "runner startup", 30_000);
  await succeeds("true", "socket command execution");
  await succeeds("cat input.txt > output.txt", "workspace read and write");
  assert.equal(await readFile(join(workspaceRoot, "output.txt"), "utf8"), "fixture\n");
  await blocked("cat .env", "sensitive file read isolation");
  await blocked("printf changed > .env", "sensitive file write isolation");
  assert.equal(await readFile(join(workspaceRoot, ".env"), "utf8"), "synthetic-private-value");
  await blocked(`cat ../${workspacePath}-other/private.txt`, "cross-workspace read isolation");
  await blocked("cat escape-link", "symlink escape isolation");
  await blocked("true", "workspace path traversal", "../outside");
  await succeeds("cat .env.example", "safe environment template access");

  await new Promise((resolveListen) => networkTarget.listen(0, "127.0.0.1", resolveListen));
  const port = networkTarget.address().port;
  assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), "fixture");
  await blocked(`curl --noproxy '*' --fail --silent --connect-timeout 2 --max-time 3 http://127.0.0.1:${port}`, "network namespace isolation");
  await blocked(`curl --proxy "$HTTP_PROXY" --noproxy '' --fail --silent --max-time 3 http://127.0.0.1:${port}`, "proxy network policy");

  await writeFile(join(workspaceRoot, "report.md"), "# Smoke report\n\nSynthetic data.\n");
  await succeeds("python3 -c 'import matplotlib; matplotlib.use(\"Agg\"); import matplotlib.pyplot as p; p.plot([1,2]); p.savefig(\"chart.png\")' && pandoc report.md --to=typst --output=report.typ && typst compile --root . report.typ report.pdf", "sandboxed report rendering");
  assert.ok((await readFile(join(workspaceRoot, "report.pdf"))).subarray(0, 4).equals(Buffer.from("%PDF")));

  const cancelled = await connect();
  cancelled.write(`${JSON.stringify({ workspacePath, command: "printf started > cancel-started; sleep 30; printf leaked > cancel-leaked" })}\n`);
  await waitFor(() => exists(join(workspaceRoot, "cancel-started")), "cancellable command admission");
  cancelled.destroy();
  await waitFor(async () => !(await readdir(scratchRoot)).some((name) => name.startsWith("run-")), "cancelled command scratch cleanup");
  assert.equal(await exists(join(workspaceRoot, "cancel-leaked")), false);
  console.log("PASS disconnect cancellation and scratch cleanup");
  console.log("Sandbox verification passed.");
} finally {
  networkTarget.close();
  if (runner?.pid && runnerExit === undefined) {
    try { process.kill(-runner.pid, "SIGTERM"); } catch {}
    const timer = setTimeout(() => { try { process.kill(-runner.pid, "SIGKILL"); } catch {} }, 1000);
    await runnerClosed;
    clearTimeout(timer);
  }
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(otherRoot, { recursive: true, force: true });
}
