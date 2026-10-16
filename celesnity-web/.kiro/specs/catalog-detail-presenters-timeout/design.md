# Catalog Detail Presenters Timeout Bugfix Design

## Overview

This design addresses the aborted `guided-user-tutorials` task 13.2, **Create
catalog and detail presenters**. The observed defect is an execution that remained
active until the 3,600,000 ms outer deadline, was aborted without an available
result, and left possible side effects. The timeout is not itself an established
root cause.

The fix strategy is therefore evidence-first and conditional:

1. freeze and classify the current side effects without rewriting them;
2. reconstruct the original operation timeline where evidence exists;
3. run one instrumented, isolated, bounded diagnostic attempt;
4. distinguish an execution-control stall, repeated or unbounded validation, a
   concurrency race, and a reproducible task-owned type/test failure;
5. select a remediation only for a cause supported by evidence; and
6. verify the selected remediation with focused presenter tests and strict type
   checking before the bounded outer deadline.

This phase creates only this design document. It does not change task 13.2
presenters or tests, neighboring task 13.1/13.4 outputs, the
`guided-user-tutorials` specification, task completion state, or execution
infrastructure.

### Architectural boundary

Task 13.2 is owned by the Interface Adapters layer. Presenters may depend only on
Entities and must return fresh, immutable, member-facing ViewModels with nested
collections copied and inaccessible or sensitive data omitted. The investigation
must not move presenter behavior into React, use cases, infrastructure, or DI.
Execution diagnosis is an orchestration concern outside the presenter contract;
a runner defect must not be compensated for in presenter code.

## Glossary

- **Bug_Condition (C)**: A task 13.2 execution reaches the 3,600,000 ms outer
  deadline, is aborted, and has no reliable terminal result or causal operation.
- **Property (P)**: A bounded diagnostic execution terminates with an attributable
  evidence record, a complete side-effect inventory, and either a proven cause or
  an explicit unresolved evidence gap; it never guesses.
- **Preservation**: For executions outside C, task ordering, concurrency policy,
  terminal behavior, valid presenter contracts, neighboring outputs, and quality
  gates remain unchanged.
- **Execution_Record**: Correlated task, child-command, process, timing, progress,
  file-write, validation, and termination evidence for one execution identifier.
- **Operation_Record**: One command or file operation with owner, command signature,
  start/end times, deadline, exit state, output reference, and affected paths.
- **Side_Effect_Manifest**: The complete set of relevant created or modified paths,
  their task ownership, validation state, and preservation decision.
- **Task_Ownership**: The task that declares an artifact or check. Task 13.2 owns
  the catalog/detail presenter files and directly owned focused verification;
  task 13.1 owns tutorial boundary schemas; task 13.4 owns walkthrough/completion
  presenters. Property 9 belongs to task 13.3.
- **Execution_Control_Stall**: The task remains non-terminal after its last child
  operation completed, failed, disappeared, or stopped making progress.
- **Repeated_Unbounded_Validation**: Watch mode, interaction, uncapped retries,
  repeated full-suite checks, or validation scope growth consumes the deadline.
- **Concurrency_Race**: A failure is observed while another task changes a needed
  path or dependency and cannot be reproduced against the same stable snapshot in
  isolation.
- **Task_Owned_Failure**: A type or test failure in task 13.2-owned work reproduces
  in isolation against a stable dependency snapshot and terminates normally.
- **Evidence_Gap**: Required evidence is unavailable; the associated hypothesis is
  neither proved nor disproved.
- **F / F′**: The original task execution behavior and the behavior after a proven,
  cause-specific remediation, respectively.

## Bug Details

### Bug Condition

Let `X` be an execution attempt and `C(X)` identify the observed failure class:

```text
C(X) ≜
  X.spec = "guided-user-tutorials"
  ∧ X.task = "13.2"
  ∧ X.elapsedMilliseconds ≥ 3_600_000
  ∧ X.parentOutcome = ABORTED_TIMEOUT
  ∧ (X.result = UNAVAILABLE
     ∨ X.terminalStatus is missing
     ∨ X.lastActiveOperation is unknown)
```

**Formal Specification:**

```text
FUNCTION isBugCondition(input)
  INPUT: input of type TaskExecution
  OUTPUT: boolean

  RETURN input.specId = "guided-user-tutorials"
         AND input.taskId = "13.2"
         AND input.elapsedMilliseconds >= 3_600_000
         AND input.parentOutcome = ABORTED_TIMEOUT
         AND (input.result = UNAVAILABLE
              OR NOT hasReliableTerminalStatus(input)
              OR NOT identifiesLastActiveOperation(input))
END FUNCTION
```

Possible side effects are evidence to inventory, not an additional prerequisite
for C. A task-owned compiler failure is likewise not C by itself: a correctly
reported compiler failure should terminate quickly rather than remain active for
one hour.

### Current Evidence and Limits

The following facts are established for the current workspace:

- `src/interface-adapters/presenters/tutorial-catalog.presenter.ts` and
  `tutorial-detail.presenter.ts` exist.
- Focused example tests for both presenters exist. A current bounded one-shot run,
  also including the task 13.3 Property 9 suite, completed all 3 files and 6 tests
  successfully in 426 ms.
- `npm run typecheck -- --pretty false` terminates with two strict errors in
  `tests/unit/interface-adapters/presenters/tutorial-catalog.presenter.test.ts`:
  TS2532 at line 43 and TS2345 at line 67.
- The aborted execution overlapped tasks 13.1 and 13.4. Their outputs and status
  are not evidence of corruption and must be preserved unless a path-level
  inventory proves otherwise.
- No active relevant process was found after the abort. This excludes a surviving
  process at observation time, but does not prove whether a child process was
  stalled, killed, or already exited during the timed-out hour.
- Historical command-level timing, retries, process state, and file-write evidence
  are currently incomplete. Therefore no root cause is selected in this design.

The passing focused tests establish that presenter behavior is presently
executable. The strict TypeScript diagnostics establish genuine defects in a
focused test file. Neither fact explains why the parent execution remained active
for one hour without the original execution timeline.

### Examples

- **Observed timeout:** Task 13.2 remains reported as running for 3,600,000 ms;
  the parent aborts it and returns no task result. Expected: a bounded terminal
  failure naming the last operation and preserving its output.
- **Task-owned failure without a stall:** Isolated strict type checking reports
  TS2532 and TS2345 in the catalog presenter test and exits non-zero. Expected:
  classify the diagnostics as task-owned verification failures and terminate;
  do not relabel this normal failure as a timeout.
- **Possible concurrency race:** A presenter check reports a missing or
  incompatible dependency while task 13.1 or 13.4 is writing overlapping state,
  then passes on the same stable snapshot in isolation. Expected: classify a race
  only when timestamps, ownership, dependency availability, and rerun evidence
  all support it.
- **Repeated validation:** The same full-suite command is launched repeatedly or
  enters watch mode after a focused check. Expected: stop at the command budget,
  record the repetition or mode, and return a terminal failure.
- **Execution-control stall:** The final child command has exited, but task 13.2
  remains `running` with no heartbeat or terminalization. Expected: the parent
  records the state mismatch, finalizes failure, and names the completed child as
  the last operation.
- **Evidence gap:** Original logs contain only the outer timeout. Expected: report
  the root cause as unresolved, perform a bounded instrumented isolated attempt,
  and select no cause-specific fix unless that attempt supplies discriminating
  evidence.

### Root-Cause Decision Model

The classifier can report multiple associated findings, but it selects exactly
one **primary timeout cause** only when the corresponding proof threshold is met.
A task-owned diagnostic may coexist with an execution-control cause.

| Candidate                     | Required proof                                                                                                                                                                               | Evidence that excludes it as the primary timeout cause                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Execution-control stall       | The operation/process timeline shows no progress past its budget, or a child reached terminal state while the task stayed running; parent finalization did not occur within its grace period | Every child and parent state transition completed within budget                                        |
| Repeated/unbounded validation | Command records show watch/interactive mode, uncapped retries, duplicate validation signatures, repeated full-suite launches, or cumulative validation work consuming the deadline           | Exactly one allowed one-shot invocation per check, each ending within budget                           |
| Concurrency race              | A failure coincides with another task's write/dependency transition, the affected path or dependency is shared, and the same check passes against the stable isolated snapshot               | The same failure reproduces in isolation, or no relevant write/dependency overlap exists               |
| Genuine task-owned failure    | The same diagnostic reproduces in a task 13.2-owned file under isolated stable inputs and exits normally                                                                                     | It disappears without a task-owned change, belongs to another task, or is observed only during overlap |

If evidence satisfies none or more than one primary threshold without a way to
order causality, the result is `UNRESOLVED_EVIDENCE_GAP`. The design forbids
choosing the most plausible hypothesis by intuition.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Task executions that do not satisfy C continue to follow their declared
  dependency order, concurrency policy, and terminal-result behavior.
- Valid task 13.1 boundary schemas and task 13.4 walkthrough/completion presenters
  remain byte-for-byte unchanged and retain their completion state.
- Catalog/detail presenters continue to produce complete fresh ViewModels,
  deep-copy nested collections, map status/progress and selected context names,
  expose start availability, and omit inaccessible details and Sensitive Values.
- Strict TypeScript and test failures remain visible failures; compiler settings,
  assertions, and quality thresholds are not weakened.
- The full repository quality gate remains required at designated checkpoints,
  but is not repeatedly executed inside a narrow diagnostic attempt.
- Existing uncommitted tutorial work outside the classified task 13.2 manifest is
  neither reverted nor adopted as part of this remediation.

**Scope:**

All inputs not satisfying `isBugCondition` are outside the behavioral change.
This includes:

- normally completing or normally failing spec tasks;
- presenter inputs and ViewModel mappings;
- task 13.1 and 13.4 artifacts not proven corrupt;
- focused checks that already terminate within their command budgets;
- unrelated application, entity, controller, DI, infrastructure, and UI files;
  and
- the existing `guided-user-tutorials` requirements, design, and task plan.

## Hypothesized Root Cause

No root cause is established. The investigation retains four competing
hypotheses and tests one discriminating condition at a time.

1. **Execution-control stall**: The child operation may have completed, failed,
   deadlocked, or disappeared while the parent failed to publish a terminal task
   result.
   - Compare child process start/end and exit state with task heartbeat and parent
     terminalization times.
   - Check whether abort cleanup recorded the execution identifier, last operation,
     output, and final state.

2. **Repeated or unbounded validation**: The task may have entered watch mode,
   launched an interactive process, retried after failures, repeated full-suite
   validation, or expanded beyond two presenters.
   - Canonicalize command signatures and count invocations and retries.
   - Compare every command and write against the task 13.2 allowlist and budget.

3. **Concurrency race**: Overlap with tasks 13.1 and 13.4 may have exposed
   transient missing or incompatible state.
   - Correlate write intervals and dependency reads by execution/task ownership.
   - Re-run against a frozen snapshot with neighboring writes disabled; passing
     only in isolation supports a race but does not identify corruption by itself.

4. **Genuine task-owned type/test failure**: The catalog presenter test has two
   reproducible strict TypeScript errors even though focused runtime tests pass.
   - Reproduce each diagnostic in isolation and assign it to a task-owned path.
   - Treat it as a bounded verification failure. It explains the timeout only if
     evidence also shows retries, blocked result propagation, or failed parent
     terminalization after the compiler exited.

### Investigation Sequence

1. Capture immutable identifiers, the current Git status, hashes for relevant
   artifacts, task ownership, and any available original logs before remediation.
2. Build the Side_Effect_Manifest. Every relevant path receives exactly one state:
   `valid`, `invalid`, `unrelated`, or `requires-isolated-verification`.
3. Reconstruct the original timeline. Missing fields become explicit evidence
   gaps; they are not inferred.
4. Run one isolated diagnostic attempt on the frozen snapshot with operation
   records, process records, heartbeats, and per-command deadlines.
5. Apply the decision model. Record a primary cause only when its proof threshold
   is met; record associated defects separately.
6. Select and implement only the remediation mapped to the proven cause. If the
   cause remains unresolved, stop without a speculative code change and retain
   the diagnostic artifacts for the next investigation cycle.

## Correctness Properties

Property 1: Bug Condition - Bounded Attributable Task 13.2 Outcome

_For any_ task execution where `isBugCondition` holds, F′ SHALL complete its
bounded diagnostic attempt before the new outer deadline, inventory every
relevant side effect, identify the last active operation, and return a terminal
success or failure whose primary cause is supported by correlated evidence; when
required evidence is unavailable, F′ SHALL report `UNRESOLVED_EVIDENCE_GAP` and
select no cause-specific remediation.

```text
FUNCTION expectedBehavior(result)
  INPUT: result of type DiagnosticExecutionResult
  OUTPUT: boolean

  RETURN result.finishedBeforeOuterDeadline
         AND result.terminalStatus IN [SUCCEEDED, FAILED, ABORTED_BOUNDED]
         AND result.lastActiveOperation IS IDENTIFIED
         AND manifestIsCompletePartition(result.sideEffectManifest)
         AND everyProcessWasBounded(result.processRecords)
         AND everyCauseWasTestedOrHasExplicitEvidenceGap(result.causeAssessments)
         AND (
           (result.primaryCause IN [
              EXECUTION_CONTROL_STALL,
              REPEATED_UNBOUNDED_VALIDATION,
              CONCURRENCY_RACE,
              TASK_OWNED_FAILURE
            ]
            AND evidenceMeetsProofThreshold(result.primaryCause, result.evidence))
           OR
           (result.primaryCause = UNRESOLVED_EVIDENCE_GAP
            AND result.selectedRemediation = NONE)
         )
END FUNCTION
```

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**

Property 2: Preservation - Valid Outputs and Non-Buggy Execution Behavior

_For any_ execution where `isBugCondition` does not hold, F′ SHALL produce the
same declared ordering, concurrency, terminal result, validation semantics, and
presenter-visible behavior as F; for any valid task 13.1/13.4 or unrelated
artifact not proven corrupt, F′ SHALL preserve its contents and completion state.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

No implementation change is authorized during design. The later implementation
phase follows this order.

#### 1. Evidence capture and side-effect classification

Create an execution evidence bundle outside application source containing:

- execution ID, task ID, dispatch/start/deadline/end timestamps, and parent status;
- command signatures, modes, working directories, retries, start/end times, exit
  states, bounded output references, and process IDs;
- heartbeats and last-progress timestamps;
- relevant file-write intervals, owners, and pre/post hashes; and
- the Side_Effect_Manifest with reasons and validating checks.

Initial ownership expectations are:

| Artifact group                                                  | Expected owner           | Initial action                                                                |
| --------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `tutorial-catalog.presenter.ts`, `tutorial-detail.presenter.ts` | 13.2                     | Isolated focused verification; preserve if valid                              |
| Focused catalog/detail example tests                            | Direct 13.2 verification | Reproduce runtime/type outcomes; remediate only proven task-owned defects     |
| `tutorial.schemas.ts` and its tests                             | 13.1                     | Preserve unless hash/timeline evidence proves interference                    |
| Walkthrough/completion presenters and their tests               | 13.4                     | Preserve unless hash/timeline evidence proves interference                    |
| Catalog Property 9 test                                         | 13.3                     | Treat as neighboring verification, not a task 13.2 implementation side effect |
| Other tutorial work                                             | Other declared tasks     | Classify as unrelated and do not modify                                       |

#### 2. Bounded diagnostic execution contract

The isolated diagnostic attempt uses one-shot, non-interactive commands only:

- inventory/evidence capture: 30 seconds;
- focused presenter suites: 60 seconds, one invocation;
- strict typecheck: 300 seconds, one invocation, with diagnostics captured;
- classification and finalization: 30 seconds;
- child termination grace period: 5 seconds; and
- outer diagnostic deadline: 10 minutes.

The runner emits an operation start record immediately, a heartbeat at least every
15 seconds while work remains active, and exactly one operation end record. There
are no automatic retries. One additional attempt requires an explicit decision
and a materially changed hypothesis or evidence set. Watch flags, interactive
commands, development servers, and full-suite validation are rejected inside the
narrow attempt.

#### 3. Cause-specific remediation

Only the branch whose proof threshold is met may be implemented:

- **Execution-control stall:** Repair parent/child lifecycle finalization so every
  child exit, timeout, cancellation, or disappearance transitions the task to a
  terminal state in a `finally`-equivalent path and retains the last operation and
  bounded output.
- **Repeated/unbounded validation:** Enforce the command allowlist, one-shot mode,
  per-command deadlines, retry cap, duplicate-command detection, and scope-write
  allowlist. Full quality gates remain at checkpoints.
- **Concurrency race:** Add the minimum proven dependency barrier or path-ownership
  serialization. Do not discard valid 13.1/13.4 outputs; revalidate and reuse them.
- **Task-owned type/test failure:** Correct only the isolated, reproducible strict
  diagnostics in task 13.2-owned verification while preserving assertions and
  strictness. A normal non-zero result must propagate immediately.
- **Unresolved evidence gap:** Make no cause-specific implementation change. Improve
  evidence capture if that need is itself proved, then repeat the bounded
  investigation under the explicit single-attempt rule.

#### 4. Completion and task-state reconciliation

Task 13.2 may be marked complete only when the isolated rerun returns a reliable
terminal success, the focused presenter suites pass, strict type checking reports
no task 13.2-owned diagnostics, and the manifest contains no invalid or
unclassified task 13.2 side effect. Neighboring completion states are unchanged.
The repository-wide quality gate is then run once at the designated checkpoint,
not repeatedly inside task 13.2.

## Testing Strategy

### Validation Approach

Validation has two phases. First, exploratory checks run against F to surface
counterexamples and determine which hypothesis is supported. Second, after one
cause-specific remediation, fix checking verifies Property 1 and differential
preservation checking verifies Property 2. Tests use fake processes and virtual
time for timeout classes; they never start a real watcher or wait for a real
one-hour deadline.

### Exploratory Bug Condition Checking

**Goal:** Reproduce or exclude each cause without changing presenter behavior and
without treating a passing runtime suite or a compiler error as proof of the
one-hour stall.

**Test Plan:** Feed captured or synthetic Execution_Records into the classifier,
then execute the current task-owned focused checks once against a frozen snapshot.
Capture exact command timing, process lifecycle, diagnostics, writes, and parent
terminalization.

**Test Cases:**

1. **Parent finalization stall:** Fake a child that exits while the task remains
   running; expect a counterexample showing missing terminal propagation.
2. **Watch/deadlock/interaction:** Fake each process mode and advance virtual time
   past the command budget; expect bounded termination and the responsible process.
3. **Repeated validation:** Supply duplicate full-suite command signatures or
   uncapped retry traces; expect repetition to be identified.
4. **Concurrent transient state:** Overlap a dependency write with a failing read,
   then repeat on the frozen snapshot; classify a race only if the isolated failure
   disappears and all timing/ownership conditions hold.
5. **Task-owned strict diagnostics:** Run focused tests and typecheck separately;
   retain the current passing runtime result and TS2532/TS2345 as distinct outcomes.
6. **Missing history:** Remove command/process fields; expect an explicit evidence
   gap and no selected remediation.

**Expected Counterexamples:**

- the parent remains `running` after the final child exits;
- the same validation command appears repeatedly or never receives an end record;
- a failure exists only while another task writes a required path;
- an isolated compiler failure exits normally but its non-zero result is not
  propagated; or
- insufficient history prevents all cause thresholds from being evaluated.

### Fix Checking

**Goal:** For every execution satisfying C, verify a bounded attributable result
without requiring a real 3,600,000 ms wait.

```text
FOR ALL input WHERE isBugCondition(input) DO
  result := executeTask13_2_withRemediation(input, fakeClock, fakeProcesses)
  ASSERT expectedBehavior(result)
END FOR
```

Generated traces vary operation count, child completion order, process mode,
retry count, write overlap, evidence completeness, and task-owned diagnostics.
The check also asserts that a genuine compiler/test failure becomes a quick
terminal failure rather than a timeout.

### Preservation Checking

**Goal:** Verify all non-buggy executions and valid artifacts are unchanged.

```text
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT observableBehavior(F(input)) = observableBehavior(F′(input))
END FOR

FOR ALL artifact WHERE artifact.owner IN [13.1, 13.4, UNRELATED]
                        AND NOT provenCorrupt(artifact) DO
  ASSERT hashBefore(artifact) = hashAfter(artifact)
  ASSERT completionStateBefore(artifact) = completionStateAfter(artifact)
END FOR
```

**Testing Approach:** Property-based differential testing is appropriate for the
execution state machine and evidence classifier because operation orders,
timeouts, missing fields, and overlaps form a large input space. Existing focused
presenter tests and file hashes cover concrete behavior and artifact preservation.

**Test Cases:**

1. **Normal success/failure preservation:** Finite tasks retain their original
   terminal outcomes and ordering.
2. **Neighbor output preservation:** Valid 13.1 schemas and 13.4 presenters retain
   their hashes and task states.
3. **Presenter contract preservation:** Existing catalog/detail behavior,
   immutability, deep-copy, status/progress, selected-name, start-state, and
   sensitive-data assertions remain unchanged.
4. **Failure visibility preservation:** Injected strict type/test defects remain
   visible and non-zero; no assertion or compiler option is weakened.
5. **Checkpoint preservation:** Full quality-gate commands remain configured at
   declared checkpoints and are not removed by the narrow task budget.

### Unit Tests

- Test `isBugCondition` at just below, at, and above 3,600,000 ms and with each
  missing terminal-evidence variant.
- Test evidence correlation and the proof/exclusion rules for each of the four
  candidate causes, including ambiguous and incomplete evidence.
- Test Side_Effect_Manifest completeness, mutually exclusive classification, task
  ownership, and default preservation of 13.1/13.4/unrelated paths.
- Test runner finalization for success, non-zero exit, timeout, cancellation,
  disappeared child, watch/interactive detection, duplicate command, and retry cap
  using fake processes and virtual time.
- Retain focused presenter examples for complete mapping, null selections, deep
  copies, immutability, inaccessible-detail omission, and Sensitive Value omission.

### Property-Based Tests

- **Property 1:** Generate task 13.2 timeout traces with arbitrary operation
  sequences, process states, evidence gaps, retries, and overlapping writes;
  verify `expectedBehavior` and require an evidence-backed cause or explicit
  unresolved result.
- **Property 2:** Generate non-buggy executions and valid artifact manifests;
  compare F and F′ observables and assert unchanged hashes/status for preserved
  outputs.
- Run each cheap deterministic property for at least 100 cases with fake time and
  no network. Each property test references this design's exact property number.

### Integration Tests

- Run the instrumented task executor against a frozen workspace fixture where
  focused presenter tests pass and strict typecheck fails; verify the failure is
  terminal, attributable, and does not trigger retries.
- Run three controlled overlap fixtures: no shared path, shared dependency with a
  transient failure, and an isolated reproducible task-owned failure; verify only
  the second can classify a concurrency race.
- Run the post-remediation isolated task 13.2 flow with one focused presenter test
  invocation and one typecheck invocation; verify completion within 10 minutes and
  a reliable terminal result.
- Compare hashes and completion states for valid task 13.1/13.4 outputs before and
  after the flow.
- At the later designated checkpoint, run the repository quality gate once:
  `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and
  `npm run build`. No pixel-moving code is in scope, so this bugfix does not add a
  task-local visual-regression run.
