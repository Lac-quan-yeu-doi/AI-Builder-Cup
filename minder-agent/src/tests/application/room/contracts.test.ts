import { describe, expect, it } from "vitest";
import { createUnavailableRoomActor } from "@application/room";

describe("room contracts", () => {
  it("does not start an actor before room execution is ported", async () => {
    await expect(
      createUnavailableRoomActor().enqueue({} as never),
    ).rejects.toThrow("room-actor");
  });
});
