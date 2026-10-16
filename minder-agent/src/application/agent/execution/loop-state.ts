export interface LoopState {
  readonly iteration: number;
  readonly repeatedToolCalls: number;
  readonly interrupted: boolean;
}
