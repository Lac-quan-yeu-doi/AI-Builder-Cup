import { FeatureNotImplementedError } from "@application/shared/ports/index.js";
export const unavailableMcp = (): never => {
  throw new FeatureNotImplementedError("mcp-client");
};
