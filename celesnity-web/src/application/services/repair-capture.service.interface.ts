import type {
  RepairAnswer,
  RepairComparison,
  RepairProcedure,
  RepairStep,
  StepVerification,
} from '@/src/entities/models/repair-guide';

export interface RepairCaptureResult {
  readonly procedure: RepairProcedure;
  readonly model: string;
  readonly elapsedMs: number;
  readonly inputTokens?: number;
}

/** Gemini's part of repair know-how: watch, compare, check and coach. */
export interface RepairCaptureService {
  capture(
    video: Blob,
    fileName: string,
    context: { readonly machineName: string; readonly faultName: string; readonly expert: string },
    signal?: AbortSignal,
  ): Promise<RepairCaptureResult>;
  compare(
    first: { readonly expert: string; readonly procedure: RepairProcedure },
    second: { readonly expert: string; readonly procedure: RepairProcedure },
    signal?: AbortSignal,
  ): Promise<RepairComparison>;
  verify(photo: Blob, step: RepairStep, signal?: AbortSignal): Promise<StepVerification>;
  ask(
    procedure: RepairProcedure,
    step: number,
    question: string,
    signal?: AbortSignal,
  ): Promise<RepairAnswer>;
}
