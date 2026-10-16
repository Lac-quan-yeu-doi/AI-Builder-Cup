import { FeatureNotImplementedError } from "@application/shared/ports/index.js";
import type { ContextCollector } from "./instructions.js";
export const createUnavailableContextCollector = (): ContextCollector => ({
  collect: () =>
    Promise.reject(new FeatureNotImplementedError("context-collection")),
});
