export interface DescendantPolicy {
  readonly maxDepth: number;
  readonly maxDescendants: number;
}

export interface DescendantAdmission {
  readonly runId: string;
  readonly parentRunId: string;
  readonly depth: number;
}

export interface DescendantTracker {
  /**
   * Admit a descendant run under its parent. Returns false when the run would
   * exceed the configured depth or the parent's fan-out limit; such a run is
   * never tracked.
   */
  admit(admission: DescendantAdmission): boolean;
  /**
   * Interrupt a run and every scoped descendant beneath it. Returns the ids of
   * every run marked interrupted (including the root), never touching runs
   * outside the subtree.
   */
  interruptCascade(runId: string): readonly string[];
}

/**
 * Tracks the descendant tree of room runs so parent interruptions cascade to
 * children and fan-out/depth limits are enforced. The room actor remains the
 * only mutator of queue/concurrency state; this tracker only records lineage.
 *
 * Ported from the Rust room scheduler descendant-limit and interruption-cascade
 * behavior.
 */
export function createDescendantTracker(
  policy: DescendantPolicy,
): DescendantTracker {
  const children = new Map<string, Set<string>>();
  const depths = new Map<string, number>();

  const childrenOf = (runId: string): Set<string> => {
    const existing = children.get(runId);
    if (existing) return existing;
    const created = new Set<string>();
    children.set(runId, created);
    return created;
  };

  return {
    admit(admission) {
      if (admission.depth > policy.maxDepth) return false;
      const siblings = childrenOf(admission.parentRunId);
      if (siblings.size >= policy.maxDescendants) return false;
      siblings.add(admission.runId);
      depths.set(admission.runId, admission.depth);
      return true;
    },
    interruptCascade(runId) {
      const interrupted: string[] = [];
      const visit = (current: string): void => {
        interrupted.push(current);
        for (const child of children.get(current) ?? new Set<string>())
          visit(child);
      };
      visit(runId);
      return interrupted;
    },
  };
}
