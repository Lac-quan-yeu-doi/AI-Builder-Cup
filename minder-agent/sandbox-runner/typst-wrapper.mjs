#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";

const typst = process.env.MINDER_TYPST_BIN ?? "/usr/libexec/minder/typst";
const args = process.argv.slice(2);

function run(binary, commandArgs) {
  const result = spawnSync(binary, commandArgs, { stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    return 127;
  }
  return result.status ?? 1;
}

async function main() {
  if (args[0] !== "compile") return run(typst, args);

  const inputIndex = args.findIndex((arg) => /\.(typ|md)$/i.test(arg) && !arg.startsWith("-"));
  if (inputIndex < 0) return run(typst, args);

  const input = resolve(args[inputIndex]);
  const extension = extname(input).toLowerCase();
  if (extension !== ".typ" && extension !== ".md") return run(typst, args);

  const suffix = randomUUID().slice(0, 8);
  const entrypoint = join(dirname(input), `.minder-report-${suffix}.typ`);
  const body = extension === ".md" ? join(dirname(input), `.minder-body-${suffix}.typ`) : input;
  const generated = [entrypoint];

  try {
    if (extension === ".md") {
      generated.push(body);
      const conversion = spawnSync("pandoc", [input, "--to=typst", "--output", body], { stdio: "inherit" });
      if (conversion.error) throw conversion.error;
      if (conversion.status !== 0) return conversion.status ?? 1;
    }

    const includePath = body.startsWith(dirname(input) + "/")
      ? body.slice(dirname(input).length + 1)
      : isAbsolute(body) ? body : `./${body}`;
    const escaped = includePath.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    await writeFile(
      entrypoint,
      `#import "/usr/share/minder/celesnity-report.typ": celesnityReport\n#show: celesnityReport\n#include "${escaped}"\n`,
      { flag: "wx" },
    );

    args[inputIndex] = entrypoint;
    const outputArgument = args[inputIndex + 1];
    if (
      !args.includes("--output") &&
      !args.includes("-o") &&
      (outputArgument === undefined || outputArgument.startsWith("-"))
    ) {
      args.push(input.replace(/\.(typ|md)$/i, ".pdf"));
    }
    const rootIndex = args.indexOf("--root");
    if (rootIndex >= 0) args[rootIndex + 1] = "/";
    else args.splice(1, 0, "--root", "/");
    return run(typst, args);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Report compilation failed."}\n`);
    return 1;
  } finally {
    await Promise.all(generated.map((path) => unlink(path).catch(() => {})));
  }
}

process.exitCode = await main();
