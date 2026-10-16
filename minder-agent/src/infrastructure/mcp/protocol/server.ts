export type McpServerConfig =
  | {
      readonly kind: "stdio";
      readonly command: string;
      readonly args: readonly string[];
      readonly env: Readonly<Record<string, string>>;
      readonly discoveryAllowlist: readonly string[];
    }
  | {
      readonly kind: "remote";
      readonly url: string;
      readonly headers: Readonly<Record<string, string>>;
      readonly discoveryAllowlist: readonly string[];
    };
export const environmentVariableReferences = (
  input: string,
): readonly string[] =>
  [...input.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(
    (match) => match[1] ?? "",
  );
export const resolveEnvironmentVariables = (
  input: string,
  values: Readonly<Record<string, string | undefined>>,
): string =>
  input.replaceAll(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (_, name: string) => values[name]?.trim() ?? "",
  );
