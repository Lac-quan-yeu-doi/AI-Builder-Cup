import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, realpath, rm, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";

const SOCKET_PATH = process.env.MINDER_SANDBOX_SOCKET ?? "/run/minder-sandbox/runner.sock";
const WORKSPACE_CACHE = resolve(process.env.MINDER_WORKSPACE_CACHE ?? "/tmp/minder-workspaces");
const SCRATCH_ROOT = resolve(process.env.MINDER_SANDBOX_SCRATCH ?? "/sandbox-scratch");
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_OUTPUT_BYTES = 10_000;
const MAX_STARTUP_DIAGNOSTIC_BYTES = 2_000;
const MAX_CONCURRENT_COMMANDS = 2;
const SAFE_ENV = {
  HOME: "/tmp",
  LANG: "C.UTF-8",
  PATH: "/opt/report-python/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  TMPDIR: "/tmp",
};
const DENY_DEFAULT_SCRATCH_PATHS = ["/tmp/claude", "/tmp/.npm/_logs"];
const insensitiveGlob = (name) =>
  [...name]
    .map((character) =>
      /[a-z]/i.test(character)
        ? `[${character.toLowerCase()}${character.toUpperCase()}]`
        : character,
    )
    .join("");
const ENV_GLOB = insensitiveGlob(".env");
const SENSITIVE_WORKSPACE_GLOBS = [
  `**/${ENV_GLOB}`,
  `**/${ENV_GLOB}.*`,
  ...[
    "credentials.json",
    "service-account.json",
    "id_rsa",
    "id_ed25519",
    ".npmrc",
    ".pypirc",
  ].map((name) => `**/${insensitiveGlob(name)}`),
];
const SAFE_ENV_TEMPLATES = ["example", "sample", "template"].map(
  (suffix) => `**/${ENV_GLOB}.${insensitiveGlob(suffix)}`,
);

function isWithin(root, path) {
  const pathFromRoot = relative(root, path);
  return pathFromRoot === "" || (!isAbsolute(pathFromRoot) && pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`));
}

function send(socket, value) {
  if (!socket.destroyed) socket.end(`${JSON.stringify(value)}\n`);
}

function errorOutput(error) {
  const message = error instanceof Error ? error.message : "Sandbox execution failed.";
  return Buffer.from(message, "utf8").subarray(0, MAX_OUTPUT_BYTES).toString("utf8");
}

function appendBounded(state, chunk, maxBytes = MAX_OUTPUT_BYTES) {
  const value = chunk.toString();
  const remaining = maxBytes - Buffer.byteLength(state.output, "utf8");
  if (remaining > 0) state.output += Buffer.from(value).subarray(0, remaining).toString();
}

export function bubblewrapStartupError(code, stderr) {
  // Never include the wrapped command: it contains generated proxy credentials.
  const redacted = stderr
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/(CLOUDSDK_PROXY_PASSWORD(?:\s+|=))[^\s]+/g, "$1[redacted]");
  const detail = Buffer.from(redacted.trim(), "utf8")
    .subarray(0, MAX_STARTUP_DIAGNOSTIC_BYTES)
    .toString("utf8")
    .trimEnd();
  return new Error(
    `Bubblewrap startup probe exited with code ${code ?? "unknown"}${detail ? `: ${detail}` : "."}`,
  );
}

export function probeBubblewrap(command, { timeoutMs = 10_000 } = {}) {
  return new Promise((resolveProbe, rejectProbe) => {
    const diagnostics = { output: "" };
    let timedOut = false;
    let killTimer;
    const child = spawn("/bin/bash", ["-c", command], {
      cwd: "/tmp",
      env: SAFE_ENV,
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const killGroup = (signal) => {
      if (!child.pid) return;
      try { process.kill(-child.pid, signal); } catch {}
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGTERM");
      killTimer = setTimeout(() => killGroup("SIGKILL"), 250);
    }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); clearTimeout(killTimer); };
    child.stdout.on("data", (chunk) => appendBounded(diagnostics, chunk, MAX_STARTUP_DIAGNOSTIC_BYTES));
    child.stderr.on("data", (chunk) => appendBounded(diagnostics, chunk, MAX_STARTUP_DIAGNOSTIC_BYTES));
    child.once("error", (error) => { cleanup(); rejectProbe(error); });
    child.once("close", (code) => {
      cleanup();
      if (timedOut) {
        rejectProbe(new Error(`Bubblewrap startup probe timed out after ${timeoutMs}ms.`));
      } else if (code === 0) {
        resolveProbe();
      } else {
        rejectProbe(bubblewrapStartupError(code, diagnostics.output));
      }
    });
  });
}

function runProcess(binary, args, options = {}) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: options.env ?? SAFE_ENV,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const state = { output: "" };
    child.stdout.on("data", (chunk) => appendBounded(state, chunk));
    child.stderr.on("data", (chunk) => appendBounded(state, chunk));
    child.once("error", rejectProcess);
    child.once("close", (code) => resolveProcess({ code: code ?? -1, output: state.output }));
  });
}

export async function probeRenderDependencies({ scratchRoot = SCRATCH_ROOT, run = runProcess }) {
  for (const [binary, args] of [
    ["typst", ["--version"]],
    ["pandoc", ["--version"]],
    ["python3", ["-c", "import matplotlib"]],
  ]) {
    let result;
    try {
      result = await run(binary, args, {
        env: binary === "python3"
          ? { ...SAFE_ENV, MPLCONFIGDIR: join(scratchRoot, "matplotlib-probe") }
          : SAFE_ENV,
      });
    } catch {
      throw new Error(`Report renderer prerequisite ${binary} is unavailable.`);
    }
    if (result.code !== 0) {
      throw new Error(`Report renderer prerequisite ${binary} is unavailable.`);
    }
  }

  const probeRoot = await mkdtemp(join(scratchRoot, "renderer-probe-"));
  try {
    const markdown = join(probeRoot, "probe.md");
    const source = join(probeRoot, "probe.typ");
    const output = join(probeRoot, "probe.pdf");
    await writeFile(markdown, "# Renderer probe\n\nReady.\n", "utf8");
    const conversion = await run("pandoc", [markdown, "--to=typst", "--output", source], {
      cwd: probeRoot,
      env: { ...SAFE_ENV, TMPDIR: probeRoot },
    });
    if (conversion.code !== 0) {
      throw new Error("Offline Markdown-to-Typst startup conversion failed.");
    }
    const result = await run(
      "typst",
      ["compile", "--root", probeRoot, source, output],
      {
        cwd: probeRoot,
        env: { ...SAFE_ENV, TMPDIR: probeRoot },
      },
    );
    if (result.code !== 0) {
      throw new Error("Offline Typst startup compile failed.");
    }
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

async function resolveWorkspace(workspacePath, workingDirectory) {
  if (typeof workspacePath !== "string" || !workspacePath || isAbsolute(workspacePath)) {
    throw new Error("Invalid workspace path.");
  }
  const lexicalRoot = resolve(WORKSPACE_CACHE, workspacePath);
  if (!isWithin(WORKSPACE_CACHE, lexicalRoot) || lexicalRoot === WORKSPACE_CACHE) {
    throw new Error("Workspace is outside the configured cache.");
  }
  const cacheRoot = await realpath(WORKSPACE_CACHE);
  const workspaceRoot = await realpath(lexicalRoot);
  if (!isWithin(cacheRoot, workspaceRoot) || workspaceRoot === cacheRoot) {
    throw new Error("Workspace is outside the configured cache.");
  }
  const candidateWorkingDirectory = resolve(workspaceRoot, workingDirectory || ".");
  if (!isWithin(workspaceRoot, candidateWorkingDirectory)) {
    throw new Error("Working directory is outside the active workspace.");
  }
  const canonicalWorkingDirectory = await realpath(candidateWorkingDirectory);
  if (!isWithin(workspaceRoot, canonicalWorkingDirectory)) {
    throw new Error("Working directory is outside the active workspace.");
  }
  return { cacheRoot, workspaceRoot, workingDirectory: canonicalWorkingDirectory };
}

async function runCommand(request, socket) {
  if (request.kind !== undefined) throw new Error("Unsupported sandbox request kind.");
  if (typeof request.command !== "string" || !request.command.trim() || request.command.length > 128_000) {
    throw new Error("Command is missing or exceeds the size limit.");
  }
  const { cacheRoot, workspaceRoot, workingDirectory } = await resolveWorkspace(
    request.workspacePath,
    request.workingDirectory,
  );
  const scratchPath = await mkdtemp(join(SCRATCH_ROOT, "run-"));
  let child;
  let killTimer;
  let interrupted = false;
  const state = { output: "" };
  const terminate = (reason) => {
    if (reason === "disconnect") interrupted = true;
    if (!child?.pid) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    killTimer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }, 250).unref();
  };
  const onDisconnect = () => terminate("disconnect");
  socket.once("close", onDisconnect);

  try {
    const invocationId = typeof request.invocationId === "string" && request.invocationId
      ? request.invocationId.slice(0, 128)
      : randomUUID();
    const wrapped = await SandboxManager.wrapWithSandbox(
      request.command,
      "/bin/bash",
      {
        filesystem: {
          denyRead: [
            cacheRoot,
            ...SENSITIVE_WORKSPACE_GLOBS.map((pattern) => join(workspaceRoot, pattern)),
          ],
          allowRead: [
            workspaceRoot,
            "/usr/share/minder",
            ...SAFE_ENV_TEMPLATES.map((pattern) => join(workspaceRoot, pattern)),
          ],
          allowWrite: [workspaceRoot, scratchPath],
          denyWrite: [
            ...SENSITIVE_WORKSPACE_GLOBS.map((pattern) => join(workspaceRoot, pattern)),
            ...DENY_DEFAULT_SCRATCH_PATHS,
          ],
        },
        network: { allowedDomains: [], deniedDomains: [] },
      },
      undefined,
      { commandId: invocationId, commandText: request.command },
    );
    child = spawn("/bin/bash", ["-c", wrapped], {
      cwd: workingDirectory,
      detached: true,
      env: {
        ...SAFE_ENV,
        TMPDIR: scratchPath,
        MPLCONFIGDIR: join(scratchPath, "matplotlib"),
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => appendBounded(state, chunk));
    child.stderr.on("data", (chunk) => appendBounded(state, chunk));
    if (interrupted) terminate("disconnect");
    const code = await new Promise((resolveCode, reject) => {
      child.once("error", reject);
      child.once("close", resolveCode);
    });
    clearTimeout(killTimer);
    if (interrupted) {
      return { success: false, output: `Command was interrupted.\n${state.output}`, exitCode: -1, interrupted: true };
    }
    if (code !== 0) {
      return {
        success: false,
        output: `Command exited with code ${code ?? "unknown"}.\n${state.output}`,
        exitCode: code ?? -1,
      };
    }
    return { success: true, output: state.output, exitCode: 0 };
  } finally {
    clearTimeout(killTimer);
    socket.removeListener("close", onDisconnect);
    await rm(scratchPath, { recursive: true, force: true });
  }
}

async function startRunner() {
  // Kubernetes fsGroup owns permissions on the mounted socket directory.
  await mkdir(dirname(SOCKET_PATH), { recursive: true });
  await mkdir(WORKSPACE_CACHE, { recursive: true });
  await mkdir(SCRATCH_ROOT, { recursive: true });
  const cacheRoot = await realpath(WORKSPACE_CACHE);
  const scratchRoot = await realpath(SCRATCH_ROOT);
  if (cacheRoot === "/" || scratchRoot === "/" || isWithin(cacheRoot, scratchRoot) || isWithin(scratchRoot, cacheRoot)) {
    throw new Error("Workspace cache and sandbox scratch paths must be separate non-root directories.");
  }
  const check = await SandboxManager.checkDependenciesAsync();
  if (check.errors.length > 0) throw new Error(`Sandbox dependencies unavailable: ${check.errors.join(", ")}`);
  if (check.warnings.length > 0) throw new Error(`Sandbox isolation prerequisites unavailable: ${check.warnings.join(", ")}`);
  await probeRenderDependencies({ scratchRoot });
  await SandboxManager.initialize({
    enableWeakerNestedSandbox: true,
    filesystem: {
      denyRead: [cacheRoot],
      allowRead: [],
      allowWrite: [scratchRoot],
      denyWrite: DENY_DEFAULT_SCRATCH_PATHS,
    },
    network: { allowedDomains: [], deniedDomains: [] },
  });
  const probe = await SandboxManager.wrapWithSandbox("true", "/bin/bash", {
    filesystem: {
      denyRead: [cacheRoot],
      allowRead: [],
      allowWrite: [scratchRoot],
      denyWrite: DENY_DEFAULT_SCRATCH_PATHS,
    },
    network: { allowedDomains: [], deniedDomains: [] },
  });
  try {
    await probeBubblewrap(probe);
  } catch (error) {
    await SandboxManager.reset();
    throw error;
  }
  try {
    await unlink(SOCKET_PATH);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  let activeCommands = 0;
  const server = net.createServer((socket) => {
    let input = "";
    let handled = false;
    socket.on("data", async (chunk) => {
      if (handled) return;
      input += chunk.toString("utf8");
      if (Buffer.byteLength(input, "utf8") > MAX_REQUEST_BYTES) {
        handled = true;
        send(socket, { success: false, output: "Sandbox request exceeds the size limit.", exitCode: -1 });
        return;
      }
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      handled = true;
      if (activeCommands >= MAX_CONCURRENT_COMMANDS) {
        send(socket, { success: false, output: "Sandbox runner is busy; retry shortly.", exitCode: -1 });
        return;
      }
      activeCommands += 1;
      try {
        const request = JSON.parse(input.slice(0, newline));
        const result = await runCommand(request, socket);
        send(socket, result);
      } catch (error) {
        send(socket, { success: false, output: errorOutput(error), exitCode: -1 });
      } finally {
        activeCommands -= 1;
      }
    });
  });
  server.listen(SOCKET_PATH, async () => {
    await chmod(SOCKET_PATH, 0o660);
    process.stdout.write("sandbox runner ready\n");
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await startRunner();
}
