import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PostgresAssertionReplayStore } from "@infrastructure/auth";

describe("durable assertion replay boundary", () => {
  it("uses a unique atomic insert and rejects an already consumed assertion", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 });
    const pool = { query } as unknown as Pool;
    await new PostgresAssertionReplayStore(pool, "minder").consume(
      "id",
      160,
      100,
    );
    await expect(
      new PostgresAssertionReplayStore(pool, "minder").consume("id", 160, 100),
    ).rejects.toMatchObject({ code: "assertion_replayed" });
    expect(query.mock.calls[1]?.[0]).toContain(
      "ON CONFLICT (jti) DO NOTHING RETURNING jti",
    );
    expect(query.mock.calls[1]?.[1]).toEqual(["id", 160]);
  });

  it("fails closed when shared state is unavailable", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("database unavailable")),
    } as unknown as Pool;
    await expect(
      new PostgresAssertionReplayStore(pool, "minder").consume("id", 160, 100),
    ).rejects.toMatchObject({ code: "auth_capacity_unavailable" });
  });

  it("rejects unsafe schema identifiers", () => {
    expect(
      () => new PostgresAssertionReplayStore({} as Pool, 'minder";'),
    ).toThrow("Invalid replay schema");
  });
});
