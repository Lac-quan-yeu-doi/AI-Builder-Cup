import { FeatureNotImplementedError } from "@application/shared/ports/index.js";
import type { SecretRedactor } from "./evidence/contracts.js";
export const createUnavailableSecretRedactor = (): SecretRedactor => ({
  redact() {
    throw new FeatureNotImplementedError("secret-redaction");
  },
});
