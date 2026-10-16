import type { CallerId } from "../values/ids.js";
export interface User {
  readonly id: CallerId;
  readonly displayName?: string;
}
