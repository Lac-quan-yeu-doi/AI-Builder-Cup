import type { JsonObject } from "@domain/shared";
import { BashTool } from "./bash.js";
import { EditTool, MultiEditTool } from "./edit.js";
import { GlobTool } from "./glob.js";
import { GrepTool } from "./grep.js";
import { ReadTool } from "./read.js";
import { TaskUpdateTool, TodoWriteTool } from "./todos.js";
import { WriteTool } from "./write.js";
import { ToolRegistry } from "./registry.js";

const ASK_USER: JsonObject = {
  type: "object",
  properties: {
    question: { type: "string", description: "The question to ask the human." },
    options: { type: "array", items: { type: "object" } },
    allow_other: { type: "boolean", description: "Allow free-text answers." },
  },
  required: ["question"],
};

export function createInteractiveRegistry(): ToolRegistry {
  return new ToolRegistry([
    new ReadTool(),
    new WriteTool(),
    new EditTool(),
    new MultiEditTool(),
    new GlobTool(),
    new GrepTool(),
    new BashTool(),
    new TodoWriteTool(),
    new TaskUpdateTool(),
    {
      name: "AskUser",
      description: "Ask the human a question and pause until they answer.",
      parameters: ASK_USER,
    },
  ]);
}

export function createAutonomousRegistry(): ToolRegistry {
  return new ToolRegistry([
    new ReadTool(),
    new WriteTool(),
    new EditTool(),
    new MultiEditTool(),
    new GlobTool(),
    new GrepTool(),
    new BashTool(),
  ]);
}
