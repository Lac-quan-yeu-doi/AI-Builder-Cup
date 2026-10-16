import type { LlmConfig } from "@infrastructure/configuration";
import type { AgentEvent, AgentRun, RunOutcome } from "@domain/shared";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { main, type CliIo } from "../../../presentation/cli/main.js";

const validEnv = {
  LLM_BASE_URL: "http://provider.test/v1",
  LLM_API_KEY: "super-secret-value",
  LLM_MODEL: "minder-test",
};

class MemoryWritable {
  text = "";

  write(chunk: string | Uint8Array): boolean {
    this.text +=
      typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    return true;
  }
}

function ioFor(
  events: AgentEvent[],
  outcome: RunOutcome,
  signal?: AbortSignal,
): { io: CliIo; stdout: MemoryWritable; stderr: MemoryWritable } {
  const stdout = new MemoryWritable();
  const stderr = new MemoryWritable();
  const io: CliIo = {
    stdout: stdout as unknown as NodeJS.WritableStream,
    stderr: stderr as unknown as NodeJS.WritableStream,
    createAgent: (_config: LlmConfig) => ({
      run: () =>
        ({
          result: Promise.resolve(outcome),
          interrupt: () => undefined,
          async *[Symbol.asyncIterator]() {
            yield* events;
          },
        }) satisfies AgentRun,
    }),
  };
  if (signal) io.signal = signal;
  return { io, stdout, stderr };
}

describe("CLI main", () => {
  it("defaults migration to dry-run and supports apply, report, and verify", async () => {
    const directory = await mkdtemp(join(tmpdir(), "minder-cli-migration-"));
    try {
      const inventoryPath = join(directory, "inventory.json");
      const reportPath = join(directory, "report.json");
      await writeFile(
        inventoryPath,
        JSON.stringify({ version: 1, generated_at: "now", members: [] }),
        "utf8",
      );
      const { io, stdout } = ioFor([], { status: "completed", text: "" });
      const modes: string[] = [];
      io.manifestMigration = {
        async migrate(input) {
          modes.push(input.mode);
          return { generatedAt: "now", cutoverReady: true, entries: [] };
        },
        async verify() {
          modes.push("verify");
          return { generatedAt: "now", cutoverReady: true, entries: [] };
        },
      };

      await expect(
        main(
          ["agent-manifests", "migrate", "--inventory", inventoryPath],
          validEnv,
          io,
        ),
      ).resolves.toBe(0);
      await expect(
        main(
          [
            "agent-manifests",
            "migrate",
            "--inventory",
            inventoryPath,
            "--apply",
            "--report",
            reportPath,
          ],
          validEnv,
          io,
        ),
      ).resolves.toBe(0);
      await expect(
        main(
          ["agent-manifests", "verify", "--inventory", inventoryPath],
          validEnv,
          io,
        ),
      ).resolves.toBe(0);
      expect(modes).toEqual(["dry-run", "apply", "verify"]);
      expect(JSON.parse(await readFile(reportPath, "utf8"))).toEqual({
        generatedAt: "now",
        cutoverReady: true,
        entries: [],
      });
      expect(stdout.text).toContain('"cutoverReady": true');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps reasoning on stderr and text on stdout", async () => {
    const { io, stdout, stderr } = ioFor(
      [
        { type: "reasoning", data: "inspect" },
        { type: "text", data: "summary" },
        { type: "done", data: null },
      ],
      { status: "completed", text: "summary" },
    );

    const code = await main(["summarize", "this", "task"], validEnv, io);

    expect(code).toBe(0);
    expect(stdout.text).toBe("summary\n");
    expect(stderr.text).toBe("[reasoning] inspect\n");
  });

  it("prints usage for an empty task", async () => {
    const { io, stderr } = ioFor([], { status: "failed", text: "" });
    const code = await main([], validEnv, io);

    expect(code).toBe(2);
    expect(stderr.text).toBe("Usage: minder <task>\n");
  });

  it("prints a redacted configuration error", async () => {
    const { io, stdout, stderr } = ioFor([], { status: "failed", text: "" });
    const code = await main(
      ["task"],
      {
        LLM_API_KEY: validEnv.LLM_API_KEY,
        LLM_MODEL: validEnv.LLM_MODEL,
      },
      io,
    );

    expect(code).toBe(2);
    expect(stdout.text).toBe("");
    expect(stderr.text).toBe(
      JSON.stringify({
        error: {
          code: "configuration",
          message: "Missing required environment variable: LLM_BASE_URL.",
        },
      }) + "\n",
    );
    expect(stderr.text).not.toContain(validEnv.LLM_API_KEY);
  });

  it("prints one structured provider error and returns one", async () => {
    const { io, stdout, stderr } = ioFor(
      [
        { type: "text", data: "partial" },
        { type: "done", data: null },
      ],
      {
        status: "failed",
        text: "partial",
        error: {
          code: "provider",
          message: "Provider rejected the request (HTTP 401).",
        },
      },
    );
    const code = await main(["task"], validEnv, io);

    expect(code).toBe(1);
    expect(stdout.text).toBe("partial");
    expect(stderr.text).toBe(
      JSON.stringify({
        error: {
          code: "provider",
          message: "Provider rejected the request (HTTP 401).",
        },
      }) + "\n",
    );
  });

  it("forwards an aborted signal to the active run and returns 130", async () => {
    const controller = new AbortController();
    let interrupted = false;
    let resolveResult!: (outcome: RunOutcome) => void;
    const result = new Promise<RunOutcome>((resolve) => {
      resolveResult = resolve;
    });
    const stdout = new MemoryWritable();
    const stderr = new MemoryWritable();
    const io: CliIo = {
      stdout: stdout as unknown as NodeJS.WritableStream,
      stderr: stderr as unknown as NodeJS.WritableStream,
      signal: controller.signal,
      createAgent: () => ({
        run: () =>
          ({
            result,
            interrupt: () => {
              interrupted = true;
              resolveResult({
                status: "interrupted",
                text: "",
                error: { code: "interrupted", message: "Run interrupted." },
              });
            },
            async *[Symbol.asyncIterator]() {
              await result;
              yield { type: "done", data: null };
            },
          }) satisfies AgentRun,
      }),
    };

    const running = main(["task"], validEnv, io);
    queueMicrotask(() => controller.abort());
    await expect(running).resolves.toBe(130);
    expect(interrupted).toBe(true);
    expect(stderr.text).toBe(
      JSON.stringify({
        error: { code: "interrupted", message: "Run interrupted." },
      }) + "\n",
    );
  });

  it("runs chat turns in one session and exits on /exit", async () => {
    const stdout = new MemoryWritable();
    const stderr = new MemoryWritable();
    const inputs: string[] = [];
    const session = {
      id: "session-1",
      mode: "interactive" as const,
      history: [],
      turns: 0,
    };
    const io: CliIo = {
      stdin: Readable.from(["hello\n", "second turn\n", "/exit\n"]),
      stdout: stdout as unknown as NodeJS.WritableStream,
      stderr: stderr as unknown as NodeJS.WritableStream,
      createAgent: () => ({
        run: () => {
          throw new Error("autonomous should not run in chat");
        },
        createInteractiveSession: () => session,
        runInSession: (_id: string, prompt: string) => {
          inputs.push(prompt);
          return completedRun(prompt);
        },
      }),
    };

    await expect(main(["--chat"], validEnv, io)).resolves.toBe(0);
    expect(inputs).toEqual(["hello", "second turn"]);
    expect(stdout.text).toContain("hello\n");
    expect(stdout.text).toContain("second turn\n");
  });

  it("renders AskUser and sends the next line to the same session", async () => {
    const stdout = new MemoryWritable();
    const stderr = new MemoryWritable();
    const prompts: string[] = [];
    let calls = 0;
    const io: CliIo = {
      stdin: Readable.from(["choose storage\n", "Postgres\n", "/exit\n"]),
      stdout: stdout as unknown as NodeJS.WritableStream,
      stderr: stderr as unknown as NodeJS.WritableStream,
      createAgent: () => ({
        run: () => {
          throw new Error("autonomous should not run in chat");
        },
        createInteractiveSession: () => ({
          id: "session-2",
          mode: "interactive" as const,
          history: [],
          turns: 0,
        }),
        runInSession: (_id: string, prompt: string) => {
          prompts.push(prompt);
          calls += 1;
          return calls === 1
            ? eventRun(
                [
                  {
                    type: "awaiting_input",
                    data: {
                      version: 1,
                      kind: "choice",
                      question: "Which database?",
                      options: [{ label: "Postgres" }],
                      allow_other: false,
                    },
                  },
                  { type: "done", data: null },
                ],
                { status: "completed", text: "" },
              )
            : completedRun("Using Postgres.");
        },
      }),
    };

    await expect(main(["--chat"], validEnv, io)).resolves.toBe(0);
    expect(prompts).toEqual(["choose storage", "Postgres"]);
    expect(stderr.text).toContain("Which database?");
    expect(stdout.text).toContain("Using Postgres.\n");
  });
});

function completedRun(text: string): AgentRun {
  return eventRun(
    [
      { type: "text", data: text },
      { type: "done", data: null },
    ],
    { status: "completed", text },
  );
}

function eventRun(events: AgentEvent[], outcome: RunOutcome): AgentRun {
  return {
    result: Promise.resolve(outcome),
    interrupt: () => undefined,
    async *[Symbol.asyncIterator]() {
      yield* events;
    },
  };
}
