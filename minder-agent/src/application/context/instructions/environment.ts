export interface EnvironmentContext {
  readonly workingDirectory: string;
  readonly projectRoot: string;
  readonly variables: Readonly<Record<string, string>>;
}
