import { pathToFileURL } from "node:url";
import { bootstrapCli } from "@bootstrap/cli-main.js";

if (
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url
)
  process.exitCode = await bootstrapCli(process.argv.slice(2), process.env);
