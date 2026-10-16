import { unavailable } from "@application/shared/ports/index.js";
export const unavailableLangfuse = (): never =>
  unavailable("langfuse-telemetry");
