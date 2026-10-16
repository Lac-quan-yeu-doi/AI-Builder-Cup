import { describe, expect, it } from "vitest";
import {
  createProductionTelemetry,
  FailOpenTelemetry,
  NoopTelemetry,
} from "@infrastructure/observability/index.js";

describe("production telemetry configuration", () => {
  it("uses no-op telemetry when Langfuse is not configured", () => {
    expect(createProductionTelemetry({})).toBeInstanceOf(NoopTelemetry);
  });

  it("rejects partial configuration without exposing secrets", () => {
    expect(() =>
      createProductionTelemetry({
        LANGFUSE_PUBLIC_KEY: "public",
        LANGFUSE_SECRET_KEY: "secret",
      }),
    ).toThrow("LANGFUSE_BASE_URL");
  });

  it("wraps complete configuration fail-open", () => {
    expect(
      createProductionTelemetry({
        LANGFUSE_BASE_URL: "https://langfuse.test",
        LANGFUSE_PUBLIC_KEY: "public",
        LANGFUSE_SECRET_KEY: "secret",
      }),
    ).toBeInstanceOf(FailOpenTelemetry);
  });
});
