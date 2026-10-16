import { readdir, readFile, realpath, stat } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  resolveInstructions as resolveApplicationInstructions,
  type InstructionFileSystem,
  type InstructionPath,
  type InstructionResolverPort,
  type InstructionResolution,
} from "@application/context";

const nodeFileSystem: InstructionFileSystem = {
  realpath,
  async readDirectory(path) {
    return readdir(path, { withFileTypes: true });
  },
  readFile,
  stat,
};

const nodePath: InstructionPath = {
  separator: sep,
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
};

export function resolveInstructions(input: {
  readonly projectRoot: string;
  readonly workingDirectory: string;
}): Promise<InstructionResolution> {
  return resolveApplicationInstructions({
    ...input,
    fileSystem: nodeFileSystem,
    path: nodePath,
  });
}

export function createInstructionResolver(): InstructionResolverPort {
  return {
    resolve: async ({ projectRoot, targetPath }) => {
      const workingDirectory = await workingDirectoryWithin(
        projectRoot,
        targetPath,
      );
      return resolveInstructions({ projectRoot, workingDirectory });
    },
  };
}

async function workingDirectoryWithin(
  projectRoot: string,
  targetPath: string | undefined,
): Promise<string> {
  if (!targetPath) return projectRoot;
  const slash = targetPath.replaceAll("\\", "/");
  const lastSep = slash.lastIndexOf("/");
  if (lastSep <= 0) return projectRoot;
  const candidate = resolve(projectRoot, slash.slice(0, lastSep));
  const difference = relative(projectRoot, candidate);
  const within =
    difference === "" ||
    (!difference.startsWith(`..${sep}`) &&
      difference !== ".." &&
      !isAbsolute(difference));
  if (!within) return projectRoot;
  try {
    if ((await stat(candidate)).isDirectory()) return candidate;
  } catch {
    // Missing target directory is normal; use the project root instead.
  }
  return projectRoot;
}
