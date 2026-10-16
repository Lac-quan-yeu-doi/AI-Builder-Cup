import { unavailable } from "@application/shared/ports/index.js";
export const createUnavailableTool =
  (name: string): (() => never) =>
  () =>
    unavailable(`tool:${name}`);
