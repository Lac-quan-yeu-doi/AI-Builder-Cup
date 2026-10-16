import { readFileSync } from "node:fs";
import type { AgentEvent, RunOutcome } from "@domain/shared";
import { describe, expect, it } from "vitest";

function loadDotEnv(path: string): void {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (match && match[1] && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2]!.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* absent .env: the suite will skip */
  }
}

loadDotEnv("/Users/anlnm/Desktop/Project/minder-sys/.env");
const hasCreds = Boolean(
  process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL,
);

describe.runIf(hasCreds)("live ReAct loop", () => {
  it("completes a trivial autonomous turn against the configured provider", async () => {
    const { loadLlmConfig } = await import("@infrastructure/configuration");
    const { OpenAiCompatibleGateway } = await import("@infrastructure/http");
    const { streamAutonomousTurn } = await import("@application/agent");

    const config = loadLlmConfig(process.env);
    const gateway = new OpenAiCompatibleGateway({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
    });

    const events: AgentEvent[] = [];
    let outcome: RunOutcome | undefined;
    const generator = streamAutonomousTurn({
      gateway,
      config,
      prompt: "Reply with the single word: pong.",
      signal: new AbortController().signal,
    });
    while (true) {
      const next = await generator.next();
      if (next.done) {
        outcome = next.value;
        break;
      }
      events.push(next.value);
    }

    expect(outcome?.status).toBe("completed");
    expect(events.at(-1)).toEqual({
      type: "done",
      data: { response_text: "pong" },
    });
  }, 60000);
});
