/**
 * Credential-bearing workspace files must never be exposed to agent tools.
 * Template files remain readable so projects can document configuration safely.
 */
export function isSensitiveWorkspacePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  const name = normalized.slice(normalized.lastIndexOf("/") + 1).toLowerCase();
  if (name === ".env") return true;
  if (name.startsWith(".env.")) {
    const suffix = name.slice(".env.".length);
    return !["example", "sample", "template"].includes(suffix);
  }
  return new Set([
    "credentials.json",
    "service-account.json",
    "id_rsa",
    "id_ed25519",
    ".npmrc",
    ".pypirc",
  ]).has(name);
}

export const SENSITIVE_FILE_DENIAL =
  "Access to sensitive credential files is not allowed.";
