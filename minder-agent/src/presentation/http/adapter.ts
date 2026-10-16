export interface StartServerOptions {
  readonly host: string;
  readonly port: number;
}

export function parseListenAddress(
  value: string | undefined,
): StartServerOptions {
  if (value === undefined || value.trim() === "") {
    return { host: "127.0.0.1", port: 8080 };
  }
  const match = /^(.*):(\d+)$/u.exec(value.trim());
  if (!match || !match[1]) throw new Error("Invalid MINDER_SERVE_ADDR.");
  const port = Number.parseInt(match[2]!, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("Invalid MINDER_SERVE_ADDR.");
  return { host: match[1], port };
}

export function redactStartupError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(
    /(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/giu,
    "$1<redacted>@",
  );
}
