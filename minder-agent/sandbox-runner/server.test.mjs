import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bubblewrapStartupError, probeBubblewrap, probeRenderDependencies } from "./server.mjs";

test("Bubblewrap diagnostics redact proxy credentials", () => {
  const error = bubblewrapStartupError(1, "proxy socks5h://srt.command:secret@localhost:3128 failed CLOUDSDK_PROXY_PASSWORD=another-secret");
  assert.match(error.message, /proxy .*localhost:3128 failed/);
  assert.ok(!error.message.includes("secret"));
});

test("Bubblewrap probe captures the actual failing process output", async () => {
  await assert.rejects(
    probeBubblewrap("printf 'mount denied' >&2; exit 7"),
    /code 7: mount denied/,
  );
  await probeBubblewrap("true");
});

test("Bubblewrap probe times out and terminates a hanging process group", async () => {
  const started = Date.now();
  await assert.rejects(probeBubblewrap("sleep 30", { timeoutMs: 100 }), /timed out/);
  assert.ok(Date.now() - started < 2000);
});

test("Bubblewrap startup failures include bounded stderr diagnostics", () => {
  const error = bubblewrapStartupError(1, `bwrap: namespace unavailable\n${"x".repeat(5000)}`);

  assert.match(error.message, /Bubblewrap startup probe exited with code 1/);
  assert.match(error.message, /bwrap: namespace unavailable/);
  assert.ok(Buffer.byteLength(error.message, "utf8") < 2500);
});

test("renderer readiness checks Typst, Pandoc, Matplotlib, and offline compilation", async () => {
  const root = await mkdtemp(join(tmpdir(), "minder-render-probe-"));
  const scratchRoot = join(root, "scratch");
  await mkdir(scratchRoot);
  const calls = [];
  try {
    await probeRenderDependencies({
      scratchRoot,
      run: async (binary, args, options) => {
        calls.push({ binary, args, options });
        return { code: 0, stdout: "" };
      },
    });
    assert.deepEqual(
      calls.slice(0, 3).map(({ binary }) => binary),
      ["typst", "pandoc", "python3"],
    );
    assert.ok(
      calls.some(
        ({ binary, args }) =>
          binary === "typst" &&
          args[0] === "compile" &&
          args.includes("--root") &&
          args.at(-2)?.endsWith("probe.typ") &&
          args.at(-1)?.endsWith("probe.pdf"),
      ),
    );
    assert.ok(
      calls.some(
        ({ binary, args }) =>
          binary === "pandoc" && args.includes("--to=typst") && args[0]?.endsWith("probe.md"),
      ),
    );
    assert.ok(
      calls.some(({ binary, options }) => binary === "typst" && options.cwd?.startsWith(scratchRoot)),
    );
    assert.ok(
      calls.some(({ binary, options }) =>
        binary === "python3" && options.env?.MPLCONFIGDIR?.startsWith(scratchRoot),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("renderer readiness fails closed when a required renderer command fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "minder-render-probe-"));
  const scratchRoot = join(root, "scratch");
  await mkdir(scratchRoot);
  try {
    await assert.rejects(
      probeRenderDependencies({
        scratchRoot,
        run: async (binary) =>
          binary === "python3"
            ? { code: 127, stdout: "missing" }
            : { code: 0, stdout: "" },
      }),
      /python3/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("renderer readiness fails when Markdown cannot be converted to Typst", async () => {
  const root = await mkdtemp(join(tmpdir(), "minder-render-probe-"));
  try {
    await assert.rejects(
      probeRenderDependencies({
        scratchRoot: root,
        run: async (binary, args) =>
          binary === "pandoc" && args.includes("--to=typst")
            ? { code: 1, stdout: "writer unavailable" }
            : { code: 0, stdout: "" },
      }),
      /Markdown-to-Typst/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("renderer readiness fails when Typst is unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "minder-render-probe-"));
  try {
    await assert.rejects(
      probeRenderDependencies({
        scratchRoot: root,
        run: async (binary) =>
          binary === "typst"
            ? { code: 127, stdout: "missing" }
            : { code: 0, stdout: "" },
      }),
      /typst/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
