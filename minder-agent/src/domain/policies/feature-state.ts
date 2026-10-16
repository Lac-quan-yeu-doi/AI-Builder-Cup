export type FeatureState =
  "implemented" | "contract_only" | "prompt_only" | "unavailable";

export interface FeatureAvailability {
  readonly feature: string;
  readonly state: FeatureState;
  readonly owner: string;
  readonly historicalSources: readonly string[];
}

export class FeatureNotImplementedError extends Error {
  readonly state = "unavailable" as const;

  constructor(readonly feature: string) {
    super(`Feature unavailable: ${feature}`);
    this.name = "FeatureNotImplementedError";
  }
}
