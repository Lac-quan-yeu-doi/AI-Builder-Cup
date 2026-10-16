import type { ReminderId } from "./prompts.js";
export interface Reminder {
  readonly id: ReminderId;
  readonly content: string;
}
