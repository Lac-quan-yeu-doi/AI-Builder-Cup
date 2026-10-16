import { createInterface } from "node:readline/promises";
import type { CliIo, CliAgent } from "./main.js";
import type { RunError, RunOutcome } from "@domain/shared";

export async function runChat(agent: CliAgent, io: CliIo): Promise<number> {
  if (!io.stdin || !agent.createInteractiveSession || !agent.runInSession) {
    io.stderr.write(
      JSON.stringify({
        error: {
          code: "configuration",
          message: "Interactive chat is unavailable.",
        },
      }) + "\n",
    );
    return 2;
  }
  const session = agent.createInteractiveSession();
  const readline = createInterface({ input: io.stdin, terminal: false });
  try {
    for await (const line of readline) {
      if (io.signal?.aborted) return 130;
      const prompt = line.trim();
      if (prompt === "/exit") return 0;
      if (!prompt) continue;

      const run = agent.runInSession(session.id, prompt);
      const interrupt = () => run.interrupt();
      if (io.signal) {
        if (io.signal.aborted) interrupt();
        else io.signal.addEventListener("abort", interrupt, { once: true });
      }
      let wroteText = false;
      let lastCharacter = "";
      try {
        for await (const event of run) {
          switch (event.type) {
            case "reasoning":
              io.stderr.write(`[reasoning] ${event.data}\n`);
              break;
            case "text":
              io.stdout.write(event.data);
              wroteText ||= event.data.length > 0;
              if (event.data)
                lastCharacter = event.data.at(-1) ?? lastCharacter;
              break;
            case "tool_started":
              io.stderr.write(`[tool] ${event.data.name}\n`);
              break;
            case "awaiting_input":
              io.stderr.write(`\n${event.data.question}\n`);
              for (const option of event.data.options)
                io.stderr.write(`- ${option.label}\n`);
              break;
            case "tool_finished":
            case "tool_result":
            case "token_usage":
            case "done":
              break;
          }
        }
      } finally {
        if (io.signal) io.signal.removeEventListener("abort", interrupt);
      }

      let outcome: RunOutcome;
      try {
        outcome = await run.result;
      } catch {
        writeError(io.stderr, {
          code: "transport",
          message: "The interactive run failed before producing a result.",
        });
        return 1;
      }
      if (outcome.status === "interrupted") {
        writeError(
          io.stderr,
          outcome.error ?? { code: "interrupted", message: "Run interrupted." },
        );
        return 130;
      }
      if (outcome.status !== "completed") {
        writeError(
          io.stderr,
          outcome.error ?? {
            code: "transport",
            message: "The interactive run failed.",
          },
        );
        return 1;
      }
      if (wroteText && lastCharacter !== "\n") io.stdout.write("\n");
    }
    return 0;
  } finally {
    readline.close();
  }
}

function writeError(stream: NodeJS.WritableStream, error: RunError): void {
  stream.write(`${JSON.stringify({ error })}\n`);
}
