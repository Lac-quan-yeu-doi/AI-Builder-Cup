import type { ToolDescriptor } from "@application/shared/ports/index.js";
import { executableTool, requiredStringArgument } from "./executable-tool.js";
import { allowAll, type ToolPolicy } from "./policy.js";

export interface AstGrepSource {
  /** Return candidate files as { path, text } for the given room workspace. */
  readFiles(): Promise<readonly { path: string; text: string }[]>;
}

const descriptor: ToolDescriptor = {
  name: "AstGrep",
  description:
    "Search workspace files for a literal structural pattern without evaluating project code.",
  parameters: {
    type: "object",
    properties: { pattern: { type: "string" } },
    required: ["pattern"],
  },
  category: "read",
  readOnly: true,
  destructive: false,
  aliases: [],
};

/**
 * Executable AstGrep tool. It performs a literal structural match over file
 * text and never evaluates or executes the project code it inspects.
 */
export function createAstGrepTool(
  source: AstGrepSource,
  policy: ToolPolicy = allowAll,
) {
  return executableTool(descriptor, policy, async (args) => {
    const pattern = requiredStringArgument(args, "pattern");
    if (pattern.length === 0) throw new Error("AstGrep pattern is required.");
    const files = await source.readFiles();
    const matches = files.flatMap((file) =>
      file.text
        .split("\n")
        .map((line, index) => ({
          path: file.path,
          line: index + 1,
          text: line,
        }))
        .filter((entry) => entry.text.includes(pattern)),
    );
    return {
      success: true,
      content: matches
        .map((match) => `${match.path}:${match.line}: ${match.text.trim()}`)
        .join("\n"),
      metadata: { matches: matches.length },
    };
  });
}
