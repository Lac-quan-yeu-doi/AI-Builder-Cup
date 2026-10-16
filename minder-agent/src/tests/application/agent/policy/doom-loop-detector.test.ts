import { describe, expect, it } from "vitest";
import { DoomLoopDetector } from "@application/agent/policy/doom-loop-detector.js";

describe("DoomLoopDetector", () => {
  it("trips after the same tool call repeats maxRepeated times", () => {
    const detector = new DoomLoopDetector(3);
    const call = [{ name: "Read", arguments: { path: "a.txt" } }];
    expect(detector.record(call)).toBe(false);
    expect(detector.record(call)).toBe(false);
    expect(detector.record(call)).toBe(true);
  });

  it("resets the streak when a different call appears", () => {
    const detector = new DoomLoopDetector(2);
    expect(detector.record([{ name: "Read", arguments: { path: "a" } }])).toBe(
      false,
    );
    expect(detector.record([{ name: "Read", arguments: { path: "b" } }])).toBe(
      false,
    );
    expect(detector.record([{ name: "Read", arguments: { path: "b" } }])).toBe(
      true,
    );
  });

  it("treats argument key order as identical", () => {
    const detector = new DoomLoopDetector(2);
    expect(detector.record([{ name: "E", arguments: { a: 1, b: 2 } }])).toBe(
      false,
    );
    expect(detector.record([{ name: "E", arguments: { b: 2, a: 1 } }])).toBe(
      true,
    );
  });
});
