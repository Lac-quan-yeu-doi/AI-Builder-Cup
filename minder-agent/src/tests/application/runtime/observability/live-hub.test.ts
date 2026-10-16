import { describe, expect, it } from "vitest";
import { LiveEventHub } from "@application/runtime";

const envelope = (seq: number) => ({
  runId: "run",
  seq,
  payload: { type: "text" as const, data: String(seq) },
});

describe("LiveEventHub", () => {
  it("delivers ordered events and closes pending reads", async () => {
    const hub = new LiveEventHub();
    hub.open("run");
    const subscription = hub.subscribe("run")!;
    hub.publish(envelope(1));
    expect(await subscription.next(new AbortController().signal)).toEqual(
      envelope(1),
    );
    const pending = subscription.next(new AbortController().signal);
    hub.close("run");
    await expect(pending).resolves.toBe("closed");
    expect(hub.subscribe("run")).toBeUndefined();
  });

  it("rejects an aborted read", async () => {
    const hub = new LiveEventHub();
    hub.open("run");
    const subscription = hub.subscribe("run")!;
    const controller = new AbortController();
    const pending = subscription.next(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("signals resync instead of dropping an overflowing queue", async () => {
    const hub = new LiveEventHub();
    hub.open("run");
    const subscription = hub.subscribe("run")!;
    for (let seq = 1; seq <= 257; seq += 1) hub.publish(envelope(seq));
    expect(await subscription.next(new AbortController().signal)).toBe(
      "resync",
    );
    hub.close("run");
  });
});
