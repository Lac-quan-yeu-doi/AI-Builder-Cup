import type { Admission } from "@application/runtime";

export type AdmissionReadModel =
  | {
      readonly kind: "started";
      readonly runId: string;
      readonly sessionId: string;
    }
  | {
      readonly kind: "rejected";
      readonly sessionId: string;
      readonly activeRunId: string;
    }
  | { readonly kind: "duplicate_delivery" };

export const toAdmissionReadModel = (
  admission: Admission,
): AdmissionReadModel => {
  if (admission.kind === "started")
    return {
      kind: "started",
      runId: admission.run.id,
      sessionId: admission.session.id,
    };
  if (admission.kind === "rejected")
    return {
      kind: "rejected",
      sessionId: admission.sessionId,
      activeRunId: admission.activeRunId,
    };
  return { kind: "duplicate_delivery" };
};

export interface RunManagerContract {
  readonly admissionPolicy: "single-active-run";
  readonly supportsDetachedRuns: boolean;
}
