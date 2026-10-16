import type { AgentEvent } from "./events.js";
import type { RunOutcome } from "./events.js";

export interface AgentRun extends AsyncIterable<AgentEvent> {
  readonly result: Promise<RunOutcome>;
  interrupt(): void;
}
