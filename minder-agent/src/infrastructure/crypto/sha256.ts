import { createHash } from "node:crypto";
import type { Sha256 } from "@application/shared/ports/index.js";

export const sha256: Sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
