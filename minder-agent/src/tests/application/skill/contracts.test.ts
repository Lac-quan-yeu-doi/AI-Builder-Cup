import { describe, expect, it } from "vitest";
import { createUnavailableSkillResolver } from "@application/skill";

describe("skill contracts", () => {
  it("makes unresolved skill loading explicit", async () => {
    await expect(
      createUnavailableSkillResolver().resolve("review" as never),
    ).rejects.toThrow("skill-resolution");
  });
});
