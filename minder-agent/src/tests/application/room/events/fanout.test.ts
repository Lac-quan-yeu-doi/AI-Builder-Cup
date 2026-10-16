import { describe, expect, it } from "vitest";
import {
  createDescendantTracker,
  type DescendantPolicy,
} from "@application/room";

const policy: DescendantPolicy = { maxDepth: 3, maxDescendants: 4 };

describe("room descendant fan-out and interruption cascade", () => {
  it("admits descendants within the fan-out and depth limits", () => {
    const tracker = createDescendantTracker(policy);
    expect(
      tracker.admit({ runId: "child-1", parentRunId: "root", depth: 1 }),
    ).toBe(true);
    expect(
      tracker.admit({ runId: "child-2", parentRunId: "root", depth: 1 }),
    ).toBe(true);
    // Depth beyond the cap is rejected.
    expect(
      tracker.admit({ runId: "too-deep", parentRunId: "child-1", depth: 4 }),
    ).toBe(false);
  });

  it("rejects a run once the descendant fan-out limit is reached", () => {
    const tracker = createDescendantTracker({ maxDepth: 5, maxDescendants: 2 });
    expect(tracker.admit({ runId: "a", parentRunId: "root", depth: 1 })).toBe(
      true,
    );
    expect(tracker.admit({ runId: "b", parentRunId: "root", depth: 1 })).toBe(
      true,
    );
    expect(tracker.admit({ runId: "c", parentRunId: "root", depth: 1 })).toBe(
      false,
    );
  });

  it("cascades a parent interruption to every scoped descendant", () => {
    const tracker = createDescendantTracker(policy);
    tracker.admit({ runId: "child", parentRunId: "root", depth: 1 });
    tracker.admit({ runId: "grandchild", parentRunId: "child", depth: 2 });
    tracker.admit({ runId: "unrelated", parentRunId: "other", depth: 1 });

    const interrupted = tracker.interruptCascade("root");
    expect(new Set(interrupted)).toEqual(
      new Set(["root", "child", "grandchild"]),
    );
    expect(interrupted).not.toContain("unrelated");
  });
});
