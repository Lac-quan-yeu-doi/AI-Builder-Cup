import type { InstructionSource } from "./instructions.js";

const MAX_DOCUMENT_BYTES = 50 * 1024;
const INCLUDE_PATTERN = /^\s*@include\s+(.+?)\s*$/gm;
const HTML_COMMENT_PATTERN = /<!--(?:.|\r|\n)*?-->/g;
const FIXED_CANDIDATES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".minder/instructions.md",
  "AGENTS.local.md",
  "CLAUDE.local.md",
  ".cursorrules",
  ".github/copilot-instructions.md",
] as const;

export interface InstructionDiagnostic {
  readonly code:
    | "instruction_frontmatter_invalid"
    | "instruction_include_depth_exceeded"
    | "instruction_include_outside_root"
    | "instruction_not_regular_file"
    | "instruction_read_failed"
    | "instruction_too_large";
  readonly path: string;
  readonly message: string;
}

export interface ResolvedInstruction extends InstructionSource {
  readonly path: string;
  readonly precedence: number;
}

export interface InstructionResolution {
  readonly documents: readonly ResolvedInstruction[];
  readonly diagnostics: readonly InstructionDiagnostic[];
}

export interface ResolveInstructionsInput {
  readonly projectRoot: string;
  readonly workingDirectory: string;
  readonly fileSystem: InstructionFileSystem;
  readonly path: InstructionPath;
}

export interface InstructionFileSystem {
  realpath(path: string): Promise<string>;
  readDirectory(path: string): Promise<readonly InstructionDirectoryEntry[]>;
  readFile(path: string): Promise<Uint8Array>;
  stat(path: string): Promise<InstructionStat>;
}

export interface InstructionDirectoryEntry {
  readonly name: string;
  isFile(): boolean;
}

export interface InstructionStat {
  isFile(): boolean;
}

export interface InstructionPath {
  readonly separator: string;
  basename(path: string): string;
  dirname(path: string): string;
  isAbsolute(path: string): boolean;
  relative(from: string, to: string): string;
  resolve(...paths: string[]): string;
}

export interface InstructionResolverPort {
  resolve(input: {
    readonly projectRoot: string;
    readonly targetPath?: string;
  }): Promise<InstructionResolution>;
}

interface ParsedDocument {
  readonly body: string;
  readonly paths?: readonly string[];
}

function isWithin(
  path: InstructionPath,
  root: string,
  candidate: string,
): boolean {
  const difference = path.relative(root, candidate);
  return (
    difference === "" ||
    (!difference.startsWith(`..${path.separator}`) &&
      difference !== ".." &&
      !path.isAbsolute(difference))
  );
}

function stripComments(content: string): string {
  return content.replace(HTML_COMMENT_PATTERN, "");
}

function parseDocument(content: string): ParsedDocument {
  if (!content.startsWith("---")) return { body: content };
  const end = content.indexOf("\n---", 3);
  if (end === -1)
    throw new Error("frontmatter must end with a closing --- line");
  const frontmatter = content.slice(3, end).trim();
  const body = content.slice(end + 4).replace(/^\r?\n/, "");
  const lines = frontmatter.split(/\r?\n/);
  const pathsLine = lines.findIndex((line) => /^paths\s*:/.test(line.trim()));
  if (pathsLine === -1) return { body };
  const value = lines[pathsLine]?.replace(/^\s*paths\s*:\s*/, "") ?? "";
  if (value.length > 0) {
    if (!value.startsWith("[") || !value.endsWith("]"))
      throw new Error("paths must be a YAML list");
    return {
      body,
      paths: value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean),
    };
  }
  const paths: string[] = [];
  for (let index = pathsLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line?.startsWith(" ") && !line?.startsWith("\t")) break;
    const match = /^\s*-\s*(.+?)\s*$/.exec(line);
    if (!match?.[1]) throw new Error("paths must contain scalar values");
    paths.push(match[1].replace(/^['"]|['"]$/g, ""));
  }
  if (paths.length === 0)
    throw new Error("paths must contain at least one pattern");
  return { body, paths };
}

function globMatches(pattern: string, pathname: string): boolean {
  const normalisedPattern = pattern.replaceAll("\\", "/").replace(/^\.\//, "");
  const normalisedPath = pathname.replaceAll("\\", "/");
  if (
    normalisedPattern.endsWith("/**") &&
    normalisedPath === normalisedPattern.slice(0, -3)
  )
    return true;
  const escaped = normalisedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "__MINDER_GLOBSTAR__")
    .replaceAll("*", "[^/]*")
    .replaceAll("__MINDER_GLOBSTAR__", ".*");
  return new RegExp(`^${escaped}$`).test(normalisedPath);
}

async function regularFile(
  fileSystem: InstructionFileSystem,
  path: string,
): Promise<boolean> {
  try {
    return (await fileSystem.stat(path)).isFile();
  } catch {
    return false;
  }
}

async function candidatePaths(
  fileSystem: InstructionFileSystem,
  path: InstructionPath,
  directory: string,
): Promise<readonly string[]> {
  const candidates: string[] = [
    path.resolve(directory, FIXED_CANDIDATES[0]),
    path.resolve(directory, FIXED_CANDIDATES[1]),
    path.resolve(directory, FIXED_CANDIDATES[2]),
  ];
  const rulesDirectory = path.resolve(directory, ".minder/rules");
  try {
    const entries = await fileSystem.readDirectory(rulesDirectory);
    candidates.push(
      ...entries
        .filter(
          (entry) => entry.isFile() && /\.(?:md|mdc|txt)$/i.test(entry.name),
        )
        .map((entry) => path.resolve(rulesDirectory, entry.name))
        .sort((left, right) =>
          path.basename(left).localeCompare(path.basename(right)),
        ),
    );
  } catch {
    // A missing rules directory is a normal optional configuration.
  }
  candidates.push(
    path.resolve(directory, FIXED_CANDIDATES[3]),
    path.resolve(directory, FIXED_CANDIDATES[4]),
    path.resolve(directory, FIXED_CANDIDATES[5]),
    path.resolve(directory, FIXED_CANDIDATES[6]),
  );
  return candidates;
}

function directoriesFromRoot(
  path: InstructionPath,
  root: string,
  workingDirectory: string,
): readonly string[] {
  if (!isWithin(path, root, workingDirectory))
    throw new Error("workingDirectory must be within projectRoot");
  const directories = [root];
  let current = root;
  for (const part of path
    .relative(root, workingDirectory)
    .split(path.separator)
    .filter(Boolean)) {
    current = path.resolve(current, part);
    directories.push(current);
  }
  return directories;
}

export async function resolveInstructions(
  input: ResolveInstructionsInput,
): Promise<InstructionResolution> {
  const root = await input.fileSystem.realpath(input.projectRoot);
  const workingDirectory = await input.fileSystem.realpath(
    input.workingDirectory,
  );
  const path = input.path;
  const fileSystem = input.fileSystem;
  const documents: ResolvedInstruction[] = [];
  const diagnostics: InstructionDiagnostic[] = [];
  const emitted = new Set<string>();

  const append = async (
    requestedPath: string,
    scope: InstructionSource["scope"],
    depth: number,
  ): Promise<void> => {
    if (depth > 8) {
      diagnostics.push({
        code: "instruction_include_depth_exceeded",
        path: requestedPath,
        message: "instruction include depth exceeds 8",
      });
      return;
    }
    const resolvedPath = path.resolve(requestedPath);
    if (!isWithin(path, root, resolvedPath)) {
      diagnostics.push({
        code: "instruction_include_outside_root",
        path: resolvedPath,
        message: "instruction include is outside project root",
      });
      return;
    }
    let canonicalPath: string;
    try {
      canonicalPath = await fileSystem.realpath(resolvedPath);
    } catch {
      diagnostics.push({
        code: "instruction_read_failed",
        path: requestedPath,
        message: "instruction file could not be read",
      });
      return;
    }
    if (!isWithin(path, root, canonicalPath)) {
      diagnostics.push({
        code: "instruction_include_outside_root",
        path: canonicalPath,
        message: "instruction include is outside project root",
      });
      return;
    }
    if (emitted.has(canonicalPath)) return;
    if (!(await regularFile(fileSystem, canonicalPath))) {
      diagnostics.push({
        code: "instruction_not_regular_file",
        path: canonicalPath,
        message: "instruction path is not a regular file",
      });
      return;
    }
    let raw: string;
    try {
      const file = await fileSystem.readFile(canonicalPath);
      if (file.byteLength > MAX_DOCUMENT_BYTES) {
        diagnostics.push({
          code: "instruction_too_large",
          path: canonicalPath,
          message: "instruction file exceeds 50 KiB",
        });
        return;
      }
      raw = new TextDecoder().decode(file);
    } catch {
      diagnostics.push({
        code: "instruction_read_failed",
        path: canonicalPath,
        message: "instruction file could not be read",
      });
      return;
    }
    let parsed: ParsedDocument;
    try {
      parsed = parseDocument(stripComments(raw));
    } catch (error) {
      diagnostics.push({
        code: "instruction_frontmatter_invalid",
        path: canonicalPath,
        message:
          error instanceof Error
            ? error.message
            : "invalid instruction frontmatter",
      });
      return;
    }
    const relativeWorkingDirectory =
      path.relative(root, workingDirectory).replaceAll("\\", "/") || ".";
    if (
      parsed.paths &&
      !parsed.paths.some((pattern) =>
        globMatches(pattern, relativeWorkingDirectory),
      )
    )
      return;
    emitted.add(canonicalPath);
    const includes = [...parsed.body.matchAll(INCLUDE_PATTERN)]
      .map((match) => match[1]?.trim())
      .filter((path): path is string => Boolean(path));
    for (const include of includes)
      await append(
        path.resolve(path.dirname(canonicalPath), include),
        "included",
        depth + 1,
      );
    const body = parsed.body.replace(INCLUDE_PATTERN, "").trim();
    if (body.length > 0)
      documents.push({
        content: body,
        path: canonicalPath,
        precedence: documents.length,
        scope,
      });
  };

  for (const directory of directoriesFromRoot(path, root, workingDirectory)) {
    const scope: InstructionSource["scope"] =
      directory === root ? "project" : "subdirectory";
    for (const candidate of await candidatePaths(fileSystem, path, directory)) {
      if (await regularFile(fileSystem, candidate))
        await append(candidate, scope, 0);
    }
  }
  return { diagnostics, documents };
}
