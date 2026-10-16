import { FeatureNotImplementedError } from "@application/shared/ports/index.js";
import type { SkillResolver } from "./resolver.js";
export const createUnavailableSkillResolver = (): SkillResolver => ({
  resolve: () =>
    Promise.reject(new FeatureNotImplementedError("skill-resolution")),
});
