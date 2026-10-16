import { FeatureNotImplementedError } from "@application/shared/ports/index.js";
import type { AgentLoop } from "../execution/loop.js";
export const createUnavailableAgentLoop = (): AgentLoop => ({
  run() {
    const outcome = Promise.reject(
      new FeatureNotImplementedError("full-react-loop"),
    );
    void outcome.catch(() => undefined);
    return {
      events: (async function* () {})(),
      outcome,
    };
  },
});
