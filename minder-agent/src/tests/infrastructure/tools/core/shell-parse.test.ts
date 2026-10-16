import { describe, expect, it } from "vitest";
import { parseSimpleCommand } from "@infrastructure/tools/core/index.js";

describe("parseSimpleCommand", () => {
  it("parses quoted and escaped arguments without a shell", () => {
    expect(parseSimpleCommand('git log --format="%h %s"')).toEqual([
      "git",
      "log",
      "--format=%h %s",
    ]);
    expect(parseSimpleCommand("cat 'README file.md'")).toEqual([
      "cat",
      "README file.md",
    ]);
  });

  it("rejects shell operators, expansion, and malformed input", () => {
    for (const command of [
      "",
      "cat a | grep b",
      "echo $(pwd)",
      "cat > out",
      "'unterminated",
    ]) {
      expect(() => parseSimpleCommand(command)).toThrow();
    }
  });
});
