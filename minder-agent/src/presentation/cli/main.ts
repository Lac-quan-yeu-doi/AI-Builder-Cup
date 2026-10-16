import type { MinderAgent } from "@application/agent";
import { ConfigError, loadLlmConfig } from "@infrastructure/configuration";
import type { RunError, RunOutcome } from "@domain/shared";
import { readFile, writeFile } from "node:fs/promises";
import type {
  AgentManifestInventory,
  AgentManifestMigration,
  ManifestMigrationReport,
} from "./agent-manifest-migration.js";
import { runChat } from "./chat.js";

export type CliAgent = Pick<MinderAgent, "run"> &
  Partial<Pick<MinderAgent, "createInteractiveSession" | "runInSession">>;

export interface CliIo {
  stdin?: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  createAgent(config: ReturnType<typeof loadLlmConfig>): CliAgent;
  manifestMigration?: AgentManifestMigration;
  signal?: AbortSignal;
}

export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  io: CliIo,
): Promise<number> {
  if (argv[0] === "agent-manifests")
    return runManifestCommand(argv.slice(1), io);

  const chat = argv[0] === "--chat";
  if (chat && argv.length !== 1) {
    io.stderr.write("Usage: minder --chat\n");
    return 2;
  }
  const prompt = argv.join(" ").trim();
  if (!chat && !prompt) {
    io.stderr.write("Usage: minder <task>\n");
    return 2;
  }

  let config: ReturnType<typeof loadLlmConfig>;
  try {
    config = loadLlmConfig(env);
  } catch (error) {
    const normalized =
      error instanceof ConfigError
        ? { code: error.code, message: error.message }
        : { code: "configuration" as const, message: "Invalid configuration." };
    writeError(io.stderr, normalized);
    return 2;
  }

  const agent = io.createAgent(config);
  if (chat) return runChat(agent, io);
  const run = agent.run(prompt);
  const interrupt = () => run.interrupt();
  if (io.signal) {
    if (io.signal.aborted) interrupt();
    else io.signal.addEventListener("abort", interrupt, { once: true });
  }

  let wroteText = false;
  let lastTextCharacter = "";
  try {
    for await (const event of run) {
      switch (event.type) {
        case "reasoning":
          io.stderr.write(`[reasoning] ${event.data}\n`);
          break;
        case "text":
          io.stdout.write(event.data);
          wroteText ||= event.data.length > 0;
          if (event.data.length > 0) {
            lastTextCharacter = event.data.at(-1) ?? lastTextCharacter;
          }
          break;
        case "token_usage":
        case "done":
          break;
      }
    }
  } catch {
    if (io.signal) io.signal.removeEventListener("abort", interrupt);
    writeError(io.stderr, {
      code: "transport",
      message: "The autonomous run failed while rendering output.",
    });
    return 1;
  }
  if (io.signal) io.signal.removeEventListener("abort", interrupt);

  let outcome: RunOutcome;
  try {
    outcome = await run.result;
  } catch {
    writeError(io.stderr, {
      code: "transport",
      message: "The autonomous run failed before producing a result.",
    });
    return 1;
  }

  if (outcome.status === "completed") {
    if (wroteText && lastTextCharacter !== "\n") io.stdout.write("\n");
    return 0;
  }

  writeError(io.stderr, outcome.error ?? fallbackError(outcome));
  return outcome.status === "interrupted" ? 130 : 1;
}

async function runManifestCommand(
  argv: readonly string[],
  io: CliIo,
): Promise<number> {
  const parsed = parseManifestCommand(argv);
  if (parsed === undefined) {
    io.stderr.write(
      "Usage: minder agent-manifests migrate|verify --inventory <path> [--dry-run|--apply] [--report <path>] [--organization <id>]\n",
    );
    return 2;
  }
  if (io.manifestMigration === undefined) {
    writeError(io.stderr, {
      code: "configuration",
      message: "Agent manifest migration is not configured.",
    });
    return 2;
  }
  try {
    const inventory = JSON.parse(
      await readFile(parsed.inventoryPath, "utf8"),
    ) as AgentManifestInventory;
    const report: ManifestMigrationReport =
      parsed.command === "migrate"
        ? await io.manifestMigration.migrate({
            inventory,
            mode: parsed.mode,
            ...(parsed.organizationId === undefined
              ? {}
              : { organizationId: parsed.organizationId }),
          })
        : await io.manifestMigration.verify({
            inventory,
            ...(parsed.organizationId === undefined
              ? {}
              : { organizationId: parsed.organizationId }),
          });
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (parsed.reportPath !== undefined)
      await writeFile(parsed.reportPath, serialized, "utf8");
    io.stdout.write(serialized);
    return report.cutoverReady ? 0 : 1;
  } catch {
    writeError(io.stderr, {
      code: "configuration",
      message: "Agent manifest migration failed.",
    });
    return 1;
  }
}

function parseManifestCommand(argv: readonly string[]):
  | {
      readonly command: "migrate";
      readonly inventoryPath: string;
      readonly mode: "dry-run" | "apply";
      readonly reportPath?: string;
      readonly organizationId?: string;
    }
  | {
      readonly command: "verify";
      readonly inventoryPath: string;
      readonly reportPath?: string;
      readonly organizationId?: string;
    }
  | undefined {
  const command = argv[0];
  if (command !== "migrate" && command !== "verify") return undefined;
  let inventoryPath: string | undefined;
  let reportPath: string | undefined;
  let organizationId: string | undefined;
  let apply = false;
  let dryRun = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--inventory") inventoryPath = argv[++index];
    else if (argument === "--report") reportPath = argv[++index];
    else if (argument === "--organization") organizationId = argv[++index];
    else if (argument === "--apply") apply = true;
    else if (argument === "--dry-run") dryRun = true;
    else return undefined;
  }
  if (!inventoryPath?.trim() || reportPath === "" || organizationId === "")
    return undefined;
  if (command === "verify") {
    if (apply || dryRun) return undefined;
    return {
      command,
      inventoryPath,
      ...(reportPath === undefined ? {} : { reportPath }),
      ...(organizationId === undefined ? {} : { organizationId }),
    };
  }
  if (apply && dryRun) return undefined;
  return {
    command,
    inventoryPath,
    mode: apply ? "apply" : "dry-run",
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(organizationId === undefined ? {} : { organizationId }),
  };
}

function fallbackError(outcome: RunOutcome): RunError {
  return outcome.status === "interrupted"
    ? { code: "interrupted", message: "Run interrupted." }
    : { code: "transport", message: "The autonomous run failed." };
}

function writeError(stream: NodeJS.WritableStream, error: RunError): void {
  stream.write(`${JSON.stringify({ error })}\n`);
}
