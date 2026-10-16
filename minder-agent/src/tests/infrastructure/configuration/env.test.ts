import { describe, expect, it } from "vitest";
import {
  ConfigError,
  loadLlmConfig,
} from "@infrastructure/configuration/index.js";
import { loadAgentLoopStrategy } from "@infrastructure/composition/index.js";

const valid = {
  LLM_BASE_URL: "https://llm.example/v1/",
  LLM_API_KEY: "super-secret-value",
  LLM_MODEL: "minder-test",
};

describe("loadLlmConfig", () => {
  it.each(["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"] as const)(
    "requires %s without echoing secret values",
    (variable) => {
      const env = { ...valid };
      delete env[variable];
      expect(() => loadLlmConfig(env)).toThrow(ConfigError);
      expect(() => loadLlmConfig(env)).toThrow(variable);
      expect(() => loadLlmConfig(env)).not.toThrow("super-secret-value");
    },
  );

  it("trims the base URL slash and ignores malformed temperature", () => {
    expect(loadLlmConfig({ ...valid, LLM_TEMPERATURE: "nope" })).toEqual({
      baseUrl: "https://llm.example/v1",
      apiKey: "super-secret-value",
      model: "minder-test",
    });
  });

  it("keeps optional thinking model and numeric temperature", () => {
    expect(
      loadLlmConfig({
        ...valid,
        LLM_MODEL_THINKING: "thinker",
        LLM_TEMPERATURE: "0.25",
      }),
    ).toMatchObject({ modelThinking: "thinker", temperature: 0.25 });
  });

  it("detects Gemini from the configured model", () => {
    expect(
      loadLlmConfig({ ...valid, LLM_MODEL: "gemini-3.8-flash" }),
    ).toMatchObject({ provider: "gemini" });
  });

  it("uses an explicit provider override", () => {
    expect(
      loadLlmConfig({
        ...valid,
        LLM_MODEL: "gemini-3.8-flash",
        LLM_PROVIDER: "google",
      }),
    ).toMatchObject({ provider: "google" });
  });
});

describe("loadAgentLoopStrategy", () => {
  it("defaults to the native loop and accepts LangChain", () => {
    expect(loadAgentLoopStrategy(undefined)).toBe("react");
    expect(loadAgentLoopStrategy({ MINDER_AGENT_LOOP: " langchain " })).toBe(
      "langchain",
    );
  });

  it("rejects an unknown loop owner", () => {
    expect(() => loadAgentLoopStrategy({ MINDER_AGENT_LOOP: "other" })).toThrow(
      "MINDER_AGENT_LOOP must be react or langchain.",
    );
  });
});
