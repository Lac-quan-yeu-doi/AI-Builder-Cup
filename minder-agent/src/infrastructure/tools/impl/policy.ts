import type { JsonObject } from "@domain/index.js";
import type {
  ToolDescriptor,
  ToolExecutionContext,
} from "@application/shared/ports/index.js";

export interface ToolPolicyDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

/**
 * Caller-aware authorization for an executable tool. `assertAllowed` is invoked
 * after schema validation and before the executor runs; a denial must halt the
 * call before any provider or side effect.
 */
export interface ToolPolicy {
  assertAllowed(
    descriptor: ToolDescriptor,
    context: ToolExecutionContext,
    args: JsonObject,
  ): Promise<ToolPolicyDecision>;
}

/** Policy that permits every request. */
export const allowAll: ToolPolicy = {
  assertAllowed() {
    return Promise.resolve({ allowed: true });
  },
};

/** Policy that denies every request. */
export const denyAll: ToolPolicy = {
  assertAllowed() {
    return Promise.resolve({
      allowed: false,
      reason: "Tool is not permitted for this caller.",
    });
  },
};

/** Build a policy from a caller-provided allowlist of tool names. */
export function allowlistPolicy(names: readonly string[]): ToolPolicy {
  const allowed = new Set(names);
  return {
    assertAllowed(descriptor) {
      return Promise.resolve(
        allowed.has(descriptor.name)
          ? { allowed: true }
          : {
              allowed: false,
              reason: `Tool ${descriptor.name} is not allowed.`,
            },
      );
    },
  };
}
