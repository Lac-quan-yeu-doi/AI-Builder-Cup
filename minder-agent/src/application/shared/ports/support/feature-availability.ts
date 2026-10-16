export {
  FeatureNotImplementedError,
  type FeatureAvailability,
  type FeatureState,
} from "@domain/index.js";
import { FeatureNotImplementedError } from "@domain/index.js";
export const unavailable = (feature: string): never => {
  throw new FeatureNotImplementedError(feature);
};
